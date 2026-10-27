"use client";

import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createRacingTrack, getTrackTurn } from "./racing-track";
import type { Controls, Phase, Race } from "./racing-warmup";

type Props = { raceRef: RefObject<Race>; controlsRef: RefObject<Controls>; phaseRef: RefObject<Phase> };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, segments: number, y: number) {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    positions.push(p.x + side.x * width / 2, y, p.z + side.z * width / 2);
    positions.push(p.x - side.x * width / 2, y, p.z - side.z * width / 2);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function box(parent: THREE.Group, material: THREE.Material, size: [number, number, number], pos: [number, number, number], radius = 0) {
  const geometry = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  if (radius) mesh.rotation.y = radius;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function roundedCarBox(parent: THREE.Group, material: THREE.Material, size: [number, number, number], pos: [number, number, number], radius = .12) {
  const geometry = new RoundedBoxGeometry(...size, 4, radius);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeCar() {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: "#f04478", roughness: .27, metalness: .24 });
  const dark = new THREE.MeshStandardMaterial({ color: "#101820", roughness: .72 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#090c10", roughness: .92 });
  const alloy = new THREE.MeshStandardMaterial({ color: "#89949a", metalness: .7, roughness: .3 });
  const glass = new THREE.MeshStandardMaterial({ color: "#244554", metalness: .45, roughness: .22 });
  const light = new THREE.MeshStandardMaterial({ color: "#ff4039", emissive: "#a51412", emissiveIntensity: .6 });
  // Lower, longer rounded shell gives the practice car a smoother touring-racer profile.
  roundedCarBox(car, bodyMat, [2.16, .46, 3.72], [0, .61, 0], .28);
  roundedCarBox(car, bodyMat, [1.66, .23, 1.52], [0, .88, -.53], .17);
  roundedCarBox(car, glass, [1.22, .43, 1.12], [0, 1.15, -.69], .2);
  roundedCarBox(car, dark, [2.72, .12, .22], [0, .48, 1.67], .045);
  roundedCarBox(car, bodyMat, [2.58, .11, .18], [0, 1.02, 1.52], .04);
  roundedCarBox(car, dark, [1.8, .13, .52], [0, .46, 1.35], .06);
  for (const x of [-1.15, 1.15]) {
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(.47, .47, .32, 16), rubber);
    tyre.rotation.z = Math.PI / 2;
    tyre.position.set(x, .47, .8);
    tyre.castShadow = true;
    car.add(tyre);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .335, 12), alloy);
    rim.rotation.z = Math.PI / 2;
    rim.position.copy(tyre.position);
    car.add(rim);
    const frontTyre = tyre.clone();
    frontTyre.position.z = -1.05;
    car.add(frontTyre);
    const frontRim = rim.clone();
    frontRim.position.z = -1.05;
    car.add(frontRim);
    box(car, light, [.12, .16, .08], [x * .68, .68, 1.77]);
  }
  box(car, dark, [2.6, .12, .16], [0, .92, 1.72]);
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, .22, 10), alloy);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0, .42, 1.82);
  car.add(exhaust);
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(.22, 1.05, 10),
    new THREE.MeshBasicMaterial({ color: "#54dfff", transparent: true, opacity: .88 })
  );
  flame.rotation.x = -Math.PI / 2;
  flame.position.set(0, .45, 2.35);
  flame.visible = false;
  car.add(flame);
  car.userData.flame = flame;
  return car;
}

export default function Racing3DScene({ raceRef, controlsRef, phaseRef }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = mountRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      host.dataset.webgl = "unavailable";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setSize(host.clientWidth || 800, host.clientHeight || 480, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "Three-dimensional racing circuit with rear chase camera");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#9fc8dc");
    scene.fog = new THREE.Fog("#b2c7bd", 95, 270);
    const camera = new THREE.PerspectiveCamera(63, (host.clientWidth || 800) / (host.clientHeight || 480), .1, 420);
    const hemi = new THREE.HemisphereLight("#e7f5ff", "#405239", 2.05);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff0d3", 3.1);
    sun.position.set(-45, 80, -25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -65; sun.shadow.camera.right = 65; sun.shadow.camera.top = 85; sun.shadow.camera.bottom = -85;
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: "#628653", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.12; ground.receiveShadow = true; scene.add(ground);

    const track = createRacingTrack();
    const road = new THREE.Mesh(ribbon(track, 12, 600, .015), new THREE.MeshStandardMaterial({ color: "#30383e", roughness: .94, metalness: .02, side: THREE.DoubleSide }));
    road.receiveShadow = true; scene.add(road);
// Fixed visual references before significant bends: brake board, turn-in chevrons and apex beacon.
    let lastBoardAt = -1;
    for (let i = 0; i < 180; i++) {
      const t = i / 180;
      const turn = getTrackTurn(track, t, .006);
      const strength = Math.abs(turn);
      if (strength < .038 || (lastBoardAt >= 0 && (t - lastBoardAt + 1) % 1 < .075)) continue;
      lastBoardAt = t;
      const cornerPoint = track.getPointAt(t);
      const boardT = (t - .025 + 1) % 1;
      const p = track.getPointAt(boardT);
      const tangent = track.getTangentAt(boardT).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const outside = Math.sign(turn || 1);
      const board = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: "#34443b", roughness: .85 });
      const boardCanvas = document.createElement("canvas");
      boardCanvas.width = 320; boardCanvas.height = 180;
      const ctx = boardCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#f8f7ef"; ctx.fillRect(0, 0, 320, 180);
        ctx.fillStyle = "#c52f2a"; ctx.fillRect(0, 0, 320, 54);
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 30px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("BRAKE", 160, 28);
        ctx.fillStyle = "#172820"; ctx.font = "bold 38px Arial"; ctx.fillText("TURN IN", 160, 113);
        ctx.fillStyle = "#c52f2a"; ctx.fillRect(0, 160, 320, 20);
      }
      const boardTexture = new THREE.CanvasTexture(boardCanvas);
      boardTexture.colorSpace = THREE.SRGBColorSpace;
      const boardMat = new THREE.MeshBasicMaterial({ map: boardTexture, side: THREE.DoubleSide });
      const post = new THREE.Mesh(new THREE.BoxGeometry(.12, 2.2, .12), postMat);
      post.position.y = 1.1; board.add(post);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.45, .82), boardMat);
      face.position.set(0, 1.75, .09); board.add(face);
      board.position.set(p.x + side.x * outside * 9.2, 0, p.z + side.z * outside * 9.2);
      board.rotation.y = Math.atan2(-side.x * outside, -side.z * outside);
      board.traverse((node) => { const mesh = node as THREE.Mesh; mesh.castShadow = true; });
      scene.add(board);
      // A small amber beacon marks the corner's turn-in reference at track edge.
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffc84a" }));
      beacon.position.set(cornerPoint.x - side.x * outside * 5.4, .42, cornerPoint.z - side.z * outside * 5.4);
      scene.add(beacon);
    }
    const kerb = new THREE.MeshStandardMaterial({ color: "#f4eee0", roughness: .8, side: THREE.DoubleSide });
    const redKerb = new THREE.MeshStandardMaterial({ color: "#d7473d", roughness: .75, side: THREE.DoubleSide });
    const barrierMat = new THREE.MeshStandardMaterial({ color: "#dce2df", roughness: .65 });
    const darkBarrier = new THREE.MeshStandardMaterial({ color: "#283b43", roughness: .75 });
    const dashMat = new THREE.MeshStandardMaterial({ color: "#f5f1dd", roughness: .6, emissive: "#3e433c", emissiveIntensity: .18 });
    scene.add(new THREE.Mesh(ribbon(track, 15, 600, -.005), kerb));
    // Alternating red/ivory kerb blocks add visual rhythm at both road edges.
    for (let i = 0; i < 150; i++) {
      const t = i / 150;
      const p = track.getPointAt(t), tangent = track.getTangentAt(t).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const s of [-1, 1]) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(.48, .09, .82), i % 2 ? redKerb : kerb);
        block.position.set(p.x + side.x * s * 6.7, .08, p.z + side.z * s * 6.7);
        block.rotation.y = Math.atan2(tangent.x, tangent.z);
        block.receiveShadow = true; scene.add(block);
      }
    }
    // Broken centre guide dashes and distant corner markers.
    for (let i = 0; i < 100; i++) {
      const p = track.getPointAt(i / 100);
      const dash = new THREE.Mesh(new THREE.BoxGeometry(.12, .025, 1.15), dashMat);
      dash.position.set(p.x, .045, p.z); dash.rotation.y = Math.atan2(track.getTangentAt(i / 100).x, track.getTangentAt(i / 100).z);
      scene.add(dash);
    }

    // A layered low-poly horizon makes the track feel like a place, not a flat canvas.
    const hillMat = new THREE.MeshStandardMaterial({ color: "#7e9a82", roughness: 1, flatShading: true });
    for (let i = 0; i < 24; i++) {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(13 + (i % 4) * 5, 20 + (i % 5) * 7, 5), hillMat);
      const angle = i / 24 * Math.PI * 2;
      hill.position.set(Math.cos(angle) * (125 + (i % 3) * 10), 7, Math.sin(angle) * (125 + (i % 3) * 10));
      hill.rotation.y = angle; scene.add(hill);
    }
    const treeTrunks = new THREE.MeshStandardMaterial({ color: "#5c4937", roughness: 1 });
    const foliage = [new THREE.MeshStandardMaterial({ color: "#315d43", flatShading: true }), new THREE.MeshStandardMaterial({ color: "#467a4e", flatShading: true })];
    for (let i = 0; i < 68; i++) {
      const t = i / 68;
      const p = track.getPointAt(t), tangent = track.getTangentAt(t).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      const sign = i % 2 ? 1 : -1;
      const distance = 17 + (i % 4) * 2.2;
      const x = p.x + side.x * sign * distance, z = p.z + side.z * sign * distance;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .32, 2.1, 5), treeTrunks); trunk.position.y = 1.05; trunk.castShadow = true; tree.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.45 + (i % 3) * .25, 3.5 + (i % 2), 5), foliage[i % 2]); crown.position.y = 3.2; crown.castShadow = true; tree.add(crown);
      tree.position.set(x, 0, z); scene.add(tree);
    }
    // Safety rails follow the outer edge and repeat as clean, visible panels.
    for (let i = 0; i < 220; i++) {
      const t = i / 220, p = track.getPointAt(t), tangent = track.getTangentAt(t).normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(.22, .62, 2.9), i % 5 === 0 ? redKerb : barrierMat);
        rail.position.set(p.x + side.x * s * 8.4, .58, p.z + side.z * s * 8.4);
        rail.rotation.y = Math.atan2(tangent.x, tangent.z);
        rail.castShadow = true; rail.receiveShadow = true; scene.add(rail);
        const post = new THREE.Mesh(new THREE.BoxGeometry(.25, .9, .18), darkBarrier);
        post.position.set(rail.position.x, .45, rail.position.z); post.rotation.y = rail.rotation.y; scene.add(post);
      }
    }
    const car = makeCar();
    // Keep the car's proportions credible against the 12-unit road and leave
    // more visual room around it for steering on narrow mobile screens.
    car.scale.setScalar(0.82);
    scene.add(car);
    const groundShadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({ color: 0x101914, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.scale.set(1.25, 2.05, 1);
    groundShadow.position.y = 0.028;
    scene.add(groundShadow);
    // Preserve the approved circuit, scenery, camera and controls; this is a visual-only car refresh.
    const skyGlow = new THREE.Mesh(new THREE.SphereGeometry(320, 16, 10), new THREE.MeshBasicMaterial({ color: "#b9d4df", side: THREE.BackSide }));
    scene.add(skyGlow);

    // Physical barrier boundary: this is the car-centre limit offset inward from
    // the visible rail by half the car width. Swept collision prevents tunnelling
    // across a rail between rendered/physics frames, including at tight hairpins.
    const barrierSamples = 960;
    const barrierLimit = 7.42;
    const barrierLines: { ax: number; az: number; bx: number; bz: number }[] = [];
    for (let i = 0; i < barrierSamples; i++) {
      const t0 = i / barrierSamples;
      const t1 = (i + 1) / barrierSamples;
      const p0 = track.getPointAt(t0);
      const p1 = track.getPointAt(t1);
      const tangent0 = track.getTangentAt(t0).normalize();
      const tangent1 = track.getTangentAt(t1).normalize();
      const side0x = -tangent0.z, side0z = tangent0.x;
      const side1x = -tangent1.z, side1z = tangent1.x;
      for (const sign of [-1, 1]) {
        barrierLines.push({
          ax: p0.x + side0x * sign * barrierLimit,
          az: p0.z + side0z * sign * barrierLimit,
          bx: p1.x + side1x * sign * barrierLimit,
          bz: p1.z + side1z * sign * barrierLimit,
        });
      }
    }
    const segmentHit = (px: number, pz: number, qx: number, qz: number, ax: number, az: number, bx: number, bz: number) => {
      const rx = qx - px, rz = qz - pz;
      const sx = bx - ax, sz = bz - az;
      const denominator = rx * sz - rz * sx;
      if (Math.abs(denominator) < 1e-8) return null;
      const apx = ax - px, apz = az - pz;
      const t = (apx * sz - apz * sx) / denominator;
      const u = (apx * rz - apz * rx) / denominator;
      return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, x: px + rx * t, z: pz + rz * t } : null;
    };
    let previousCarX = raceRef.current.worldX;
    let previousCarZ = raceRef.current.worldZ;
    const clock = new THREE.Clock();
    let raf = 0;
    const resize = () => {
      const w = Math.max(280, host.clientWidth), h = Math.max(320, host.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const render = () => {
      const race = raceRef.current;
      const controls = controlsRef.current;
      const currentPhase = phaseRef.current;
      // Treat the same continuous offset curves as physical walls. Test the whole
      // previous-to-current movement segment so the car cannot step through a wall.
      if (currentPhase === "running") {
        let earliestHit: { t: number; x: number; z: number; ax: number; az: number; bx: number; bz: number } | null = null;
        for (const wall of barrierLines) {
          const hit = segmentHit(previousCarX, previousCarZ, race.worldX, race.worldZ, wall.ax, wall.az, wall.bx, wall.bz);
          if (hit && (!earliestHit || hit.t < earliestHit.t)) earliestHit = { ...hit, ...wall };
        }
        if (earliestHit) {
          const wallX = earliestHit.bx - earliestHit.ax;
          const wallZ = earliestHit.bz - earliestHit.az;
          const wallLength = Math.hypot(wallX, wallZ) || 1;
          let normalX = -wallZ / wallLength;
          let normalZ = wallX / wallLength;
          if ((previousCarX - earliestHit.ax) * normalX + (previousCarZ - earliestHit.az) * normalZ < 0) {
            normalX = -normalX; normalZ = -normalZ;
          }
          race.worldX = earliestHit.x + normalX * 0.08;
          race.worldZ = earliestHit.z + normalZ * 0.08;
          const outwardSpeed = race.velocityX * normalX + race.velocityZ * normalZ;
          if (outwardSpeed < 0) {
            race.velocityX -= normalX * outwardSpeed * 1.08;
            race.velocityZ -= normalZ * outwardSpeed * 1.08;
            race.speed *= 0.78;
          }
        }
      }
      previousCarX = race.worldX;
      previousCarZ = race.worldZ;
      // Render the independent world-space vehicle state; track geometry is not a movement rail.
      const carWorld = new THREE.Vector3(race.worldX, .015, race.worldZ);
      const forward = new THREE.Vector3(-Math.sin(race.worldYaw), 0, -Math.cos(race.worldYaw)).normalize();
      car.position.copy(carWorld);
      car.rotation.y = race.worldYaw;
      // Subtle suspension response: braking transfers load forward and cornering
      // rolls the body. These are visual cues driven by the physics state.
      car.rotation.x = clamp(-race.longitudinalLoad * 0.12, -0.035, 0.015);
      car.rotation.z = clamp(-race.lateralG * 0.035 - race.drift * 0.12, -0.055, 0.055);
      groundShadow.position.x = carWorld.x;
      groundShadow.position.z = carWorld.z;
      groundShadow.rotation.z = -car.rotation.y;
      const cameraTarget = new THREE.Vector3(carWorld.x + forward.x * 10, 1.25, carWorld.z + forward.z * 10);
      const cameraPosition = new THREE.Vector3(carWorld.x - forward.x * 8.4, 4.7, carWorld.z - forward.z * 8.4);
      const frameDelta = Math.min(clock.getDelta(), .05);
      camera.position.lerp(cameraPosition, 1 - Math.exp(-frameDelta * 5.5));
      camera.lookAt(cameraTarget);
      const flame = car.userData.flame as THREE.Object3D | undefined;
      if (flame) {
        flame.visible = controls.boost && race.nos > 0 && !controls.brake && currentPhase === "running";
        const pulse = .82 + Math.sin(clock.elapsedTime * 42) * .18;
        flame.scale.setScalar(pulse);
      }
      if (currentPhase === "running") {
        camera.fov = 63 + Math.min(8, race.speed / 28) + (controls.boost && race.nos > 0 && !controls.brake ? 5 : 0);
      } else camera.fov = 63;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    resize(); window.addEventListener("resize", resize); raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener("resize", resize);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [raceRef, controlsRef, phaseRef]);

  return <div ref={mountRef} className="racing-3d-root" data-phase={phaseRef.current} data-braking={controlsRef.current.brake ? "true" : "false"} />;
}
