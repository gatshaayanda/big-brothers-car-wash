"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "./racing-warmup.css";
import Racing3DScene from "./racing-3d-scene";
import { subscribeSettings } from "@/lib/firebase/big-brothers-data";
import { createRacingTrack, getTrackTurn } from "./racing-track";

export type Phase = "ready" | "countdown" | "running" | "paused" | "finished" | "crashed";
export type Controls = { steer: number; accelerate: boolean; brake: boolean; boost: boolean };
export type Race = {
  progress: number; speed: number; elapsed: number; lap: number; lapTime: number; steering: number; throttle: number; brakePressure: number;
  bestLap: number | null; lateral: number; lateralVelocity: number; heading: number; drift: number;
  nos: number; last: number; lapInvalid: boolean; offTrack: number;
  longitudinalLoad: number; lateralG: number; wheelLock: number;
  worldX: number; worldZ: number; worldYaw: number; velocityX: number; velocityZ: number; damage: number; lastImpactAt: number; trackT: number;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const wrap = (n: number, max: number) => ((n % max) + max) % max;
const newRace = (): Race => ({ progress: 0, speed: 0, elapsed: 0, lap: 1, lapTime: 0, steering: 0, throttle: 0, brakePressure: 0, bestLap: null, lateral: 0, lateralVelocity: 0, heading: 0, drift: 0, nos: 100, last: 0, lapInvalid: false, offTrack: 0, longitudinalLoad: 0, lateralG: 0, wheelLock: 0, worldX: 0, worldZ: 72, worldYaw: -1.34, velocityX: 0, velocityZ: 0, damage: 0, lastImpactAt: 0, trackT: 0 });
function fmt(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

export default function RacingWarmup({ embedded = false }: { embedded?: boolean }) {
  const [expanded, setExpanded] = useState(!embedded);
  const raceRef = useRef<Race>(newRace());
  const trackRef = useRef<ReturnType<typeof createRacingTrack> | null>(null);
  if (!trackRef.current) trackRef.current = createRacingTrack();
  const controlsRef = useRef<Controls>({ steer: 0, accelerate: false, brake: false, boost: false });
  const phaseRef = useRef<Phase>("ready");
  const [phase, setPhase] = useState<Phase>("ready");
  const [countdown, setCountdown] = useState(3);
  const [speed, setSpeed] = useState(0);
  const [lapTime, setLapTime] = useState(0);
  const [bestLap, setBestLap] = useState<number | null>(null);
  const [lap, setLap] = useState(1);
  const [nos, setNos] = useState(100);
  const [signal, setSignal] = useState({ label: "GREEN LIGHT · BUILD SPEED", tone: "go" });
  const lastSignal = useRef("");
  const cornerSkillRef = useRef({ brakedForCorner: false, turnedIn: false, exitBoostUntil: 0 });
  const [boostActive, setBoostActive] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: "success" | "error" | "info" } | null>(null);
  const [businessName, setBusinessName] = useState("Big Brothers Car Wash");
  const [promoMedia, setPromoMedia] = useState("/videos/Left.mp4");
  const promoLastRef = useRef("");
  const [promoUnavailable, setPromoUnavailable] = useState(false);
  const [promoCaching, setPromoCaching] = useState(false);
  const [promoCacheMessage, setPromoCacheMessage] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  phaseRef.current = phase;

  const notify = useCallback((text: string, kind: "success" | "error" | "info" = "success") => {
    setToast({ text, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    const stop = subscribeSettings(settings => {
      const name = settings?.businessName;
      if (typeof name === "string" && name.trim() && !/car\s+a\s+wash|😎/i.test(name.trim())) setBusinessName(name.trim());
      else setBusinessName("Big Brothers Car Wash");
    }, () => {});
    return stop;
  }, []);
  useEffect(() => {
    if ((phase !== "ready" && phase !== "crashed") || (embedded && !expanded)) return;
    const assets = ["/videos/Left.mp4", "/videos/Right.mp4", "/videos/Bays.mp4"];
    let previous = promoLastRef.current;
    try { previous = localStorage.getItem("big-brothers-racing:last-promo:v1") || previous; } catch {}
    const choices = assets.filter(asset => asset !== previous);
    const next = choices[Math.floor(Math.random() * choices.length)] || assets[0];
    promoLastRef.current = next;
    setPromoMedia(next);
    setPromoUnavailable(false);
    try { localStorage.setItem("big-brothers-racing:last-promo:v1", next); } catch {}
  }, [phase, expanded, embedded]);
  async function savePromoMediaForOffline() {
    if (promoCaching) return;
    if (!navigator.onLine) { setPromoCacheMessage("Connect to the internet to save the three clips first."); return; }
    if (!("caches" in window)) { setPromoCacheMessage("Offline media storage is not supported in this browser."); return; }
    setPromoCaching(true);
    setPromoCacheMessage("Preparing offline media…");
    const assets = ["/videos/Left.mp4", "/videos/Right.mp4", "/videos/Bays.mp4"];
    let saved = 0;
    try {
      const cache = await caches.open("big-brothers-media-v2");
      for (const asset of assets) {
        const response = await fetch(asset, { cache: "no-store" });
        if (!response.ok) throw new Error("Could not download " + asset.split("/").pop());
        await cache.put(new URL(asset, window.location.origin).toString(), response.clone());
        saved += 1;
        setPromoCacheMessage("Saved " + saved + " of 3 clips for offline use.");
      }
      setPromoCacheMessage(navigator.serviceWorker?.controller ? "All 3 clips are saved on this device for offline use." : "All 3 clips are saved. Reload the app once while online before testing offline playback.");
    } catch (error) {
      setPromoCacheMessage(saved + " of 3 clips saved. " + (error instanceof Error ? error.message : "Storage or download failed.") + " Connect again to retry.");
    } finally { setPromoCaching(false); }
  }
  useEffect(() => { if (!embedded) document.title = "Big Brothers Racing · Circuit practice"; }, [businessName, embedded]);

  const reset = useCallback((start: boolean) => {
    raceRef.current = newRace();
    cornerSkillRef.current = { brakedForCorner: false, turnedIn: false, exitBoostUntil: 0 };
    controlsRef.current = { steer: 0, accelerate: false, brake: false, boost: false };
    setSpeed(0); setLapTime(0); setBestLap(null); setLap(1); setNos(100); setBoostActive(false);
    setCountdown(3); phaseRef.current = start ? "countdown" : "ready"; setPhase(start ? "countdown" : "ready");
  }, []);
  const startRace = useCallback(() => reset(true), [reset]);
  const pauseRace = useCallback(() => {
    if (phaseRef.current === "running") {
      controlsRef.current = { steer: 0, accelerate: false, brake: false, boost: false };
      setBoostActive(false); phaseRef.current = "paused"; setPhase("paused");
    } else if (phaseRef.current === "paused") {
      raceRef.current.last = 0; phaseRef.current = "running"; setPhase("running");
    }
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (countdown <= 1) {
        setCountdown(0); raceRef.current.last = 0; phaseRef.current = "running"; setPhase("running");
      } else setCountdown(n => n - 1);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [phase, countdown]);



  useEffect(() => {
    let raf = 0;
    let previous = 0;
    let lastUi = 0;

    const frame = (now: number) => {
      const race = raceRef.current;
      const dt = previous ? Math.min((now - previous) / 1000, 0.035) : 0;
      previous = now;
      if (phaseRef.current === "running" && dt > 0) {
        const controls = controlsRef.current;
        // Smooth steering inputs before applying tyre force; ease back to centre on release.
        const steerEase = 1 - Math.exp(-dt * (Math.abs(controls.steer) > Math.abs(race.steering) ? 10.5 : 6.5));
        race.steering += (controls.steer - race.steering) * steerEase;
        const steering = race.steering;
        const t = wrap(race.progress, 1);
        const trackTurn = getTrackTurn(trackRef.current!, t, .006);
        const bend = clamp(Math.abs(trackTurn) * 28, 0, 1);
        const upcomingTurn = getTrackTurn(trackRef.current!, t + .018, .006);
        const upcomingBend = clamp(Math.abs(upcomingTurn) * 28, 0, 1);
        const speedRatio = race.speed / 205;
        const throttleTarget = controls.accelerate && !controls.brake ? 1 : 0;
        const brakeTarget = controls.brake ? 1 : 0;
        race.throttle += (throttleTarget - race.throttle) * (1 - Math.exp(-dt * (throttleTarget ? 3.8 : 6.5)));
        race.brakePressure += (brakeTarget - race.brakePressure) * (1 - Math.exp(-dt * (brakeTarget ? 32 : 12)));
        const boost = controls.boost && race.nos > 0 && !controls.brake;
        const exitBonus = now < cornerSkillRef.current.exitBoostUntil ? 5 : 0;

        // Simplified vehicle dynamics: speed is represented in km/h, forces in
        // equivalent km/h per second. Braking integrates over time, so stopping
        // distance emerges from the speed trajectory (rather than a fixed distance).
        // A speed-squared stopping-distance estimate is also used to anticipate grip.
        const speedMs = race.speed / 3.6;
        const nominalBrakeMs2 = 9.2;
        const estimatedStoppingDistance = speedMs * speedMs / (2 * nominalBrakeMs2);
        const frontLoadTransfer = clamp(race.brakePressure * (0.10 + speedRatio * 0.08), 0, 0.22);
        race.longitudinalLoad += (frontLoadTransfer - race.longitudinalLoad) * (1 - Math.exp(-dt * 7));
        const lateralDemand = Math.abs(steering) * speedRatio * speedRatio * 0.92;
        const longitudinalDemand = race.brakePressure * 0.94;
        const combinedDemand = Math.sqrt(lateralDemand * lateralDemand + longitudinalDemand * longitudinalDemand);
        const availableGrip = clamp(1.06 + race.longitudinalLoad * 0.18, 0.72, 1.12);
        const gripUse = combinedDemand / availableGrip;
        // ABS modulates a near-lock brake request. A small residual slip remains
        // visible to the handling model; steering and braking compete for tyre grip.
        const absThreshold = estimatedStoppingDistance > 45 ? 0.78 : 0.84;
        const lockDemand = clamp((gripUse - absThreshold) / 0.48, 0, 1) * race.brakePressure;
        const absActive = lockDemand > 0.08 && race.brakePressure > 0.55;
        const targetWheelLock = absActive ? lockDemand * 0.22 : lockDemand;
        race.wheelLock += (targetWheelLock - race.wheelLock) * (1 - Math.exp(-dt * (absActive ? 18 : 5)));
        const brakeEfficiency = 1 - race.wheelLock * (absActive ? 0.12 : 0.52);
        const brakeDeceleration = 36 * race.brakePressure * brakeEfficiency
          * clamp(availableGrip / Math.max(0.82, combinedDemand), 0.35, 1.08);
        const engineAcceleration = 34 * race.throttle + exitBonus;
        const aerodynamicDrag = race.speed * (0.055 + speedRatio * 0.025);
        const boostAcceleration = boost ? 30 : 0;
        race.speed = clamp(race.speed + (engineAcceleration + boostAcceleration - aerodynamicDrag - brakeDeceleration) * dt, 0, boost ? 250 : 205);
        race.nos = boost ? Math.max(0, race.nos - 25 * dt) : Math.min(100, race.nos + (controls.accelerate ? 4 : 9) * dt);
        if (race.nos <= 0 && controls.boost) { controls.boost = false; setBoostActive(false); }

        // A friction-circle model limits cornering when the tyres are already
        // spending grip on braking. Low-speed steering remains stable; excess
        // lateral demand at speed becomes slip instead of an arbitrary bend skid.
        const updatedSpeedRatio = race.speed / 205;
        const updatedLateralDemand = Math.abs(steering) * updatedSpeedRatio * updatedSpeedRatio * 0.92;
        const updatedLongitudinalDemand = race.brakePressure * 0.94;
        const remainingGrip = Math.sqrt(Math.max(0, availableGrip * availableGrip
          - Math.min(availableGrip * availableGrip, updatedLongitudinalDemand * updatedLongitudinalDemand)));
        const cornerGripRatio = updatedLateralDemand > 0
          ? clamp(remainingGrip / updatedLateralDemand, 0, 1)
          : 1;
        const brakeTurnSlide = clamp((gripUse - 0.88) / 0.55, 0, 1)
          * clamp((race.speed - 68) / 105, 0, 1)
          * clamp((Math.abs(steering) - 0.22) / 0.5, 0, 1);
        // The driver should be able to influence the car's balance: trail-braking
        // into a corner can loosen the rear, while steady throttle can sustain a
        // controllable power slide. These effects only appear at speed and near
        // the tyre-grip limit; they must not make low-speed turns feel slippery.
        const powerSlide = race.throttle
          * clamp((race.speed - 58) / 105, 0, 1)
          * clamp((Math.abs(steering) - 0.18) / 0.62, 0, 1)
          * clamp((gripUse - 0.48) / 0.75, 0, 1);
        const counterSteering = Math.abs(race.heading) > 0.035
          && Math.sign(steering) === -Math.sign(race.heading);
        const excessSteering = (1 - cornerGripRatio) * clamp(updatedLateralDemand, 0, 1);
        const corneringLoss = excessSteering * (3 + race.speed * 0.018);
        if (excessSteering > 0) race.speed = Math.max(0, race.speed - corneringLoss * dt);

        // Heading and lateral motion now respond to speed, grip and load transfer.
        const grip = clamp(1.12 - updatedSpeedRatio * 0.06 - race.brakePressure * 0.08 - race.wheelLock * 0.18, 0.62, 1.12);
        // GOLDEN BASE STEERING SIGN CONVENTION:
        // The car's forward vector is (-sin(yaw), 0, -cos(yaw)); in this world
        // coordinate system, positive yaw turns the nose toward world -X (left).
        // Therefore negate the thumb input here so LEFT input produces a LEFT turn
        // and RIGHT input produces a RIGHT turn, consistently with the chase camera.
        // The track never advances the car; tyre grip determines how velocity follows.
        const steerAngle = -steering * (0.34 - updatedSpeedRatio * 0.12);
        const forwardX = -Math.sin(race.worldYaw);
        const forwardZ = -Math.cos(race.worldYaw);
        const lateralX = Math.cos(race.worldYaw);
        const lateralZ = -Math.sin(race.worldYaw);
        const longitudinalVelocity = race.velocityX * forwardX + race.velocityZ * forwardZ;
        const lateralVelocity = race.velocityX * lateralX + race.velocityZ * lateralZ;
        // Signed longitudinal velocity preserves natural counter-steering while reversing.
        // At negative velocity, steering rotates the nose in the opposite direction as expected.
        const baseYawRate = Math.tan(steerAngle) * longitudinalVelocity / 2.65;
        // Braking while turning can rotate the rear; throttle can keep that slide
        // alive. Counter-steering adds a gentle self-correction toward the travel
        // direction, so the player can catch the car instead of being spun at once.
        const slideYawRate = Math.sign(baseYawRate || -steering)
          * (brakeTurnSlide * 0.72 + powerSlide * 0.52);
        const selfAlignYawRate = clamp(race.heading * (counterSteering ? 1.35 : 0.48), -1.25, 1.25);
        const targetYawRate = baseYawRate + slideYawRate + selfAlignYawRate;
        const gripLimit = 9.2 * clamp(1.08 - race.brakePressure * 0.35 - race.wheelLock * 0.5
          - brakeTurnSlide * 0.12 - powerSlide * 0.08, 0.36, 1.08);
        const demandedLateralAccel = targetYawRate * Math.max(0, longitudinalVelocity);
        const gripRatio = Math.min(1, gripLimit / Math.max(0.001, Math.abs(demandedLateralAccel)));
        race.worldYaw += targetYawRate * gripRatio * dt;
        race.worldYaw = Math.atan2(Math.sin(race.worldYaw), Math.cos(race.worldYaw));
        const updatedForwardX = -Math.sin(race.worldYaw);
        const updatedForwardZ = -Math.cos(race.worldYaw);
        const updatedLateralX = Math.cos(race.worldYaw);
        const updatedLateralZ = -Math.sin(race.worldYaw);
        const driveAccel = (race.throttle * 17 + (boost ? 12 : 0)) * (longitudinalVelocity < 0 ? 1.7 : 1);
        const brakeAccel = race.brakePressure * 28 * brakeEfficiency;
        const dragAccel = longitudinalVelocity * (0.32 + Math.abs(longitudinalVelocity) * 0.012);
        let nextLongitudinal = longitudinalVelocity + (driveAccel - brakeAccel - dragAccel) * dt;
        nextLongitudinal = clamp(nextLongitudinal, -7, 15.9);
        const lateralSlipDamping = gripRatio < 0.98 ? 0.72 : counterSteering ? 6.4 : 4.8;
        const lateralSlipAccel = clamp(-lateralVelocity * lateralSlipDamping, -gripLimit, gripLimit);
        const nextLateral = lateralVelocity + lateralSlipAccel * dt;
        race.velocityX = updatedForwardX * nextLongitudinal + updatedLateralX * nextLateral;
        race.velocityZ = updatedForwardZ * nextLongitudinal + updatedLateralZ * nextLateral;
        race.worldX += race.velocityX * dt;
        race.worldZ += race.velocityZ * dt;
        race.speed = clamp(Math.hypot(race.velocityX, race.velocityZ) * 3.6 / 0.28, 0, boost ? 250 : 205);
        race.heading = Math.atan2(race.velocityX, -race.velocityZ) - race.worldYaw;
        race.heading = Math.atan2(Math.sin(race.heading), Math.cos(race.heading));
        race.lateral = clamp(nextLateral, -18, 18);
        race.lateralVelocity = nextLateral;
        race.lateralG += ((targetYawRate * gripRatio) - race.lateralG) * (1 - Math.exp(-dt * 5));
        race.drift = clamp(race.heading * clamp(Math.abs(nextLateral) / 5.5, 0, 1) * 0.34, -0.32, 0.32);

        // Circuit projection is used only for lap timing, track limits, and collision queries.
        let nearestT = wrap(race.trackT, 1);
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        let nearestX = 0;
        let nearestZ = 0;
        let nearestTangentX = 0;
        let nearestTangentZ = -1;
        // Project onto the local section of the circuit, not the globally nearest
        // section. At hairpins and nearby return legs, a global nearest-point search
        // can snap to the wrong branch of the road and make the car appear to cut
        // across the track or pass through a barrier. The previous frame's trackT
        // anchors this search while still allowing forward and reverse movement.
        const projectionSamples = 960;
        const projectionWindow = 36;
        const projectionCentre = Math.round(nearestT * projectionSamples);
        for (let offset = -projectionWindow; offset <= projectionWindow; offset++) {
          const sample = ((projectionCentre + offset) % projectionSamples + projectionSamples) % projectionSamples;
          const sampleT = sample / projectionSamples;
          const point = trackRef.current!.getPointAt(sampleT);
          const dx = race.worldX - point.x;
          const dz = race.worldZ - point.z;
          const distanceSq = dx * dx + dz * dz;
          if (distanceSq < nearestDistanceSq) {
            nearestDistanceSq = distanceSq; nearestT = sampleT; nearestX = point.x; nearestZ = point.z;
            const tangent = trackRef.current!.getTangentAt(sampleT);
            nearestTangentX = tangent.x; nearestTangentZ = tangent.z;
          }
        }
        const dx = race.worldX - nearestX;
        const dz = race.worldZ - nearestZ;
        const signedOffset = dx * -nearestTangentZ + dz * nearestTangentX;
        const distanceFromCentre = Math.sqrt(nearestDistanceSq);
        // Resolve against the actual nearest-point displacement. A tangent-only
        // signed offset can under-report penetration when the projection lands near
        // the edge of its search window at a hairpin. The radial vector from the
        // selected centreline point gives a hard geometric boundary in that case.
        const sideX = -nearestTangentZ;
        const sideZ = nearestTangentX;
        const sideSign = signedOffset < 0 ? -1 : 1;
        const outwardX = distanceFromCentre > 0.0001 ? dx / distanceFromCentre : sideX * sideSign;
        const outwardZ = distanceFromCentre > 0.0001 ? dz / distanceFromCentre : sideZ * sideSign;
        const impactVelocity = race.velocityX * outwardX + race.velocityZ * outwardZ;
        // The road is 12 units wide and the visible rail is centred at 8.4.
        // Keep the car centre inside the road edge so its 2.16-unit body cannot
        // cross the rail, even when the centreline tangent is unstable at a hairpin.
        const safeOffset = 6.65;
        if (distanceFromCentre > safeOffset || Math.abs(signedOffset) > safeOffset) {
          const penetration = Math.max(distanceFromCentre, Math.abs(signedOffset)) - safeOffset;
          const correctionX = distanceFromCentre > safeOffset
            ? outwardX
            : sideX * sideSign;
          const correctionZ = distanceFromCentre > safeOffset
            ? outwardZ
            : sideZ * sideSign;
          race.worldX = nearestX + correctionX * safeOffset;
          race.worldZ = nearestZ + correctionZ * safeOffset;
          if (impactVelocity > 0) {
            const impactKmh = impactVelocity * 3.6 / 0.28;
            // Remove outward velocity at the boundary, with a small rebound for a
            // harder hit. Tangential velocity remains so the car can scrape along a wall.
            const restitution = impactKmh > 80 ? 0.16 : 0.04;
            race.velocityX -= outwardX * impactVelocity * (1 + restitution);
            race.velocityZ -= outwardZ * impactVelocity * (1 + restitution);
            race.speed *= impactKmh > 115 ? 0.52 : impactKmh > 65 ? 0.72 : 0.88;
            if (now - race.lastImpactAt > 180) {
              race.lastImpactAt = now;
              race.damage = clamp(race.damage + Math.max(0, impactKmh - 18) * (impactKmh > 115 ? 0.78 : impactKmh > 65 ? 0.38 : 0.12), 0, 100);
              if (impactKmh > 28) notify(impactKmh > 90 ? "Heavy impact · car damaged" : "Barrier contact · speed lost", impactKmh > 90 ? "error" : "info");
              if (race.damage >= 100 || impactKmh > 178) {
                controlsRef.current = { steer: 0, accelerate: false, brake: false, boost: false };
                race.velocityX = 0; race.velocityZ = 0; race.speed = 0;
                phaseRef.current = "crashed"; setPhase("crashed");
                notify("Major crash · restart the session", "error");
              }
            }
          } else if (penetration > 0) {
            // If the car was already pressed against the rail or has near-zero outward
            // velocity, keep it outside the wall anyway; reversing remains available.
            race.velocityX *= 0.98;
            race.velocityZ *= 0.98;
          }
        }
        const previousProgress = race.progress;
        race.trackT = nearestT;
        race.progress = nearestT < 0.08 && previousProgress % 1 > 0.82 && longitudinalVelocity > 0
          ? Math.floor(previousProgress) + 1 + nearestT
          : Math.floor(previousProgress) + nearestT;
        race.offTrack = distanceFromCentre > 7.2 ? race.offTrack + dt : Math.max(0, race.offTrack - dt * 1.5);
        if (distanceFromCentre > 7.2 || race.offTrack > 0.5) race.lapInvalid = true;
        race.lateral = signedOffset;
        // Practice has no crash/recovery interruption. Going wide can invalidate a
        // lap, but never takes the car away from the player or resets their inputs.

        race.elapsed += dt;
        race.lapTime += dt;
        const lapNow = Math.floor(race.progress) + 1;
        if (lapNow > race.lap) {
          if (!race.lapInvalid && (race.bestLap === null || race.lapTime < race.bestLap)) {
            race.bestLap = race.lapTime;
            setBestLap(race.lapTime);
            notify("New personal best lap!", "success");
          } else if (race.lapInvalid) notify("Lap invalid — stay on the racing surface.", "error");
          race.lap = lapNow;
          race.lapTime = 0;
          race.lapInvalid = false;
          setLap(lapNow);
        }
        if (now - lastUi > 33) {
          lastUi = now;
          setSpeed(race.speed);
          setLapTime(race.lapTime);
          setNos(race.nos);
          setBoostActive(boost);
          const cue = upcomingBend > 0.62 && race.speed > 105
            ? { label: "BRAKE POINT · LIFT NOW", tone: "brake" }
            : upcomingBend > 0.34
              ? { label: (upcomingTurn < 0 ? "TURN LEFT" : "TURN RIGHT") + " · PREPARE", tone: "turn" }
              : { label: "GREEN LIGHT · BUILD SPEED", tone: "go" };
          if (cue.tone === "brake" && lastSignal.current !== "brake") notify("Brake point ahead — lift before turn-in.", "info");
          lastSignal.current = cue.tone;
          setSignal(cue);
        }
      }
      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);
    return () => window.cancelAnimationFrame(raf);
  }, [notify]);

  useEffect(() => {
    const keyDown = (e: KeyboardEvent) => {
      if (embedded && !expanded) return;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "a", "d", "w", "s", " "].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") controlsRef.current.steer = -1;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") controlsRef.current.steer = 1;
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") controlsRef.current.accelerate = true;
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") controlsRef.current.brake = true;
      if (e.key === " " || e.key === "Shift") controlsRef.current.boost = true;
      if ((e.key.toLowerCase() === "p" || e.key === "Escape") && !e.repeat) pauseRace();
    };
    const keyUp = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "a", "d"].includes(e.key) || ["a", "d"].includes(e.key.toLowerCase())) controlsRef.current.steer = 0;
      if (e.key === "ArrowUp" || e.key.toLowerCase() === "w") controlsRef.current.accelerate = false;
      if (e.key === "ArrowDown" || e.key.toLowerCase() === "s") controlsRef.current.brake = false;
      if (e.key === " " || e.key === "Shift") { controlsRef.current.boost = false; setBoostActive(false); }
    };
    const release = () => { controlsRef.current = { steer: 0, accelerate: false, brake: false, boost: false }; setBoostActive(false); };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", release);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", release); };
  }, [pauseRace, embedded, expanded]);

  // Circular thumbstick, like the movement controls in Shooters Trigger/Paws World.
  // The knob follows the thumb in two dimensions; horizontal displacement steers the car.
  const steerStickPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const maxX = Math.max(1, rect.width * 0.28);
    const maxY = Math.max(1, rect.height * 0.28);
    const rawX = (event.clientX - (rect.left + rect.width / 2)) / maxX;
    const rawY = (event.clientY - (rect.top + rect.height / 2)) / maxY;
    const magnitude = Math.hypot(rawX, rawY);
    const scale = magnitude > 1 ? 1 / magnitude : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    controlsRef.current.steer = clamp(x, -1, 1);
    const knob = event.currentTarget.querySelector<HTMLElement>(".steering-stick-knob");
    if (knob) knob.style.transform = `translate3d(${x * maxX}px, ${y * maxY}px, 0)`;
  };
  const releaseSteerStick = (event: { currentTarget: HTMLDivElement }) => {
    controlsRef.current.steer = 0;
    const knob = event.currentTarget.querySelector<HTMLElement>(".steering-stick-knob");
    if (knob) knob.style.transform = "translate3d(0, 0, 0)";
  };
  const hold = (key: "accelerate" | "brake", down: boolean) => {
    controlsRef.current[key] = down;
    if (key === "brake" && down) {
      controlsRef.current.boost = false;
      setBoostActive(false);
    }
  };
  // NOS is a compact tap-to-toggle tactical burst, not a hold pedal.
  // Tap once to fire, tap again to cut it; braking safely cancels the burst.
  const toggleBoost = () => {
    if (phaseRef.current !== "running" || raceRef.current.nos <= 0) return;
    const next = !controlsRef.current.boost;
    controlsRef.current.boost = next;
    setBoostActive(next);
  };

  if (embedded && !expanded) return <div className="race-inline-promo"><div><p className="big-brothers-eyebrow">BIG BROTHERS RACING · QUICK BREAK</p><h2>Take a quick lap.</h2><p>A quick driving challenge while you wait—or a practice session at home. Your wash booking stays right where you left it. Offline practice does not need data.</p></div><button type="button" className="big-brothers-button primary" onClick={() => setExpanded(true)}>Play now ↗</button></div>;

  return <div className={"vula race-hub" + (embedded ? " race-hub-embedded" : "")}>
    {!embedded && <><div className="big-brothers-status"><span className="status-dot online" />Big Brothers Racing · solo circuit practice</div><header className="big-brothers-nav"><Link href="/" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Big Brothers Racing</small></span></Link><nav><Link href="/#request">Book a wash</Link><Link href="/#my-wash">My Wash</Link></nav></header><section className="big-brothers-section warmup-intro"><p className="big-brothers-eyebrow">BIG BROTHERS RACING · PRACTICE ANYTIME</p><h1>Practice today. Race your people tomorrow.</h1><p>Sharpen your braking, smooth your corners and chase a cleaner lap. The practice circuit is here for quick breaks at home, at the tuckshop or while you wait for a wash—even when your connection is gone.</p><p className="warmup-family-note">Big brother tip: invite a parent, sibling or friend to take the next turn. The best rivalry is the one you can laugh about together.</p></section></>}
    {embedded && <div className="race-inline-heading"><div><p className="big-brothers-eyebrow">BIG BROTHERS RACING · CIRCUIT PRACTICE</p><h2>Find your racing line.</h2><p>One more lap? Smooth corners, clean exits, well-timed NOS. Practice solo offline; family races and shared online competition are future upgrades.</p></div><button type="button" className="big-brothers-button secondary" onClick={() => { if (phaseRef.current === "running") pauseRace(); setExpanded(false); }}>Close game ×</button></div>}
    <section className="big-brothers-section warmup-game">
      <div className="warmup-hud warmup-circuit-hud"><div><span>Speed</span><strong>{Math.round(speed)} <small>km/h</small></strong></div><div><span>Lap</span><strong>{lap}</strong></div><div><span>Current lap</span><strong>{fmt(lapTime)}</strong></div><div><span>Best lap</span><strong>{fmt(bestLap)}</strong></div></div>
      <div className="warmup-canvas-wrap warmup-circuit-wrap">
        <Racing3DScene raceRef={raceRef} controlsRef={controlsRef} phaseRef={phaseRef} />
        <div className={"warmup-signal-chip " + signal.tone} aria-live="polite"><span />{signal.label}</div>
        {toast && <div className={"warmup-toast " + toast.kind} role="status">{toast.text}</div>}
        <div className="warmup-3d-overlay" hidden={phase === "running"} aria-live="polite">
          <span>BIG BROTHERS RACING · CIRCUIT PRACTICE</span>
          <strong>{phase === "ready" ? "Find your racing line" : phase === "countdown" ? String(countdown || 1) : phase === "paused" ? "Paused" : phase === "crashed" ? "Car disabled" : "Nice driving!"}</strong>
          <p>{phase === "ready" ? "Follow the green line. Brake at the boards, turn in on cue, clip the apex and unwind onto the exit." : phase === "countdown" ? "Get set. Smooth steering beats sudden corrections." : phase === "paused" ? "Take a breath. Resume when you're ready." : "Session complete. Take another lap and beat your time."}</p>
        </div>
      </div>
      {(phase === "ready" || phase === "crashed") && <aside className="bb-racing-promo" aria-label="Big Brothers Car Wash promotion"><div className="bb-racing-promo-media">{!promoUnavailable ? <video key={promoMedia} src={promoMedia} controls playsInline muted preload="metadata" onError={() => setPromoUnavailable(true)} aria-label="Big Brothers Car Wash media"/> : <div className="bb-racing-promo-fallback"><span className="big-brothers-mark">BB</span><strong>BIG BROTHERS CAR WASH</strong><span>Wash. Care. Go.</span></div>}</div><div className="bb-racing-promo-copy"><span className="big-brothers-eyebrow">BIG BROTHERS CAR WASH</span><strong>{phase === "crashed" ? "Need another lap?" : "While you're here, meet your wash team."}</strong><p>{phase === "crashed" ? "Take a breath, then try again. Your next run starts when you choose." : "Queue for your wash, keep your receipt, and come back for another race."}</p>{phase === "crashed" && <button type="button" className="big-brothers-button primary" onClick={startRace}>Try Again ↻</button>}<button type="button" className="big-brothers-button secondary" disabled={promoCaching} onClick={() => void savePromoMediaForOffline()}>{promoCaching ? "Saving clips…" : "Save 3 clips for offline · ~104 MB"}</button>{promoCacheMessage && <p role="status" aria-live="polite">{promoCacheMessage}</p>}</div></aside>}
      <div className="warmup-nos"><div><strong>NOS</strong><span>{Math.round(nos)}%</span></div><div className="nos-track"><span style={{ width: nos + "%" }} /></div></div>
      <div className="warmup-controls warmup-circuit-controls">
        <div className="warmup-steering" aria-label="Analog steering">
          <span className="steering-caption">STEER</span>
          <div className={"steering-stick" + (phase !== "running" ? " is-disabled" : "")}
            role="slider" aria-label="Steering thumbstick" aria-valuemin={-100} aria-valuemax={100} aria-valuenow={Math.round(controlsRef.current.steer * 100)}
            tabIndex={phase === "running" ? 0 : -1}
            onPointerDown={e => { if (phase !== "running") return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); steerStickPointer(e); }}
            onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) steerStickPointer(e); }}
            onPointerUp={releaseSteerStick} onPointerCancel={releaseSteerStick} onLostPointerCapture={releaseSteerStick}
            onKeyDown={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); const steer = e.key === "ArrowLeft" ? -0.72 : 0.72; controlsRef.current.steer = steer; const knob = e.currentTarget.querySelector<HTMLElement>(".steering-stick-knob"); if (knob) knob.style.transform = `translate3d(${steer * 25}px, 0, 0)`; } }}
            onKeyUp={e => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") releaseSteerStick({currentTarget:e.currentTarget}); }}>
            <span className="steering-stick-track" />
            <span className="steering-stick-knob"><span>●</span></span>
          </div>
          <span className="steering-caption">Move thumb to steer</span>
        </div>
        <div className="warmup-driving">
          <button type="button" aria-label="Brake" disabled={phase !== "running"} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); hold("brake", true); }} onPointerUp={() => hold("brake", false)} onPointerCancel={() => hold("brake", false)} onLostPointerCapture={() => hold("brake", false)}>BRAKE ↓</button>
          <button type="button" className="accelerate-button" aria-label="Accelerate" disabled={phase !== "running"} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); hold("accelerate", true); }} onPointerUp={() => hold("accelerate", false)} onPointerCancel={() => hold("accelerate", false)} onLostPointerCapture={() => hold("accelerate", false)}>GAS ↑</button>
          <button type="button" className="nos-button" aria-label="Toggle NOS burst" aria-pressed={boostActive} disabled={phase !== "running" || nos <= 0} onClick={toggleBoost}>{boostActive ? "NOS ON ⚡" : "TAP NOS ⚡"}</button>
        </div>
        <div className="warmup-actions">{phase === "ready" ? <button type="button" className="big-brothers-button primary" onClick={startRace}>Start driving ↗</button> : phase === "countdown" ? <button type="button" className="big-brothers-button primary" disabled>Ready {countdown || 1}…</button> : phase === "running" ? <button type="button" className="big-brothers-button primary" onClick={pauseRace}>Pause Ⅱ</button> : phase === "paused" ? <button type="button" className="big-brothers-button primary" onClick={pauseRace}>Resume ▶</button> : <button type="button" className="big-brothers-button primary" onClick={startRace}>Try Again ↻</button>}<button type="button" className="big-brothers-button secondary" onClick={() => reset(false)}>Restart ↻</button></div>
      </div>
      <p className="warmup-help">Phone: move the circular thumbstick with your left thumb; BRAKE is left and GAS is right under your right thumb. Tap NOS once for a burst, tap again to stop. Desktop: ← / → or A / D steer, ↑ / W gas, ↓ / S brake, Space / Shift NOS, P pause. Practice is free. Any real wash discount or prize must be explicitly published and confirmed by the Big Brothers team; lap times alone do not promise money off.</p>
    </section>
    {!embedded && <footer className="big-brothers-footer"><Link href="/" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></Link><Link href="/#request">Book a wash</Link><Link href="/#my-wash">My Wash</Link></footer>}
  </div>;
}
