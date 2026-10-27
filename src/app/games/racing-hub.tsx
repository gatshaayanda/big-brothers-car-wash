"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import "./racing.css";
import { subscribeSettings } from "@/lib/firebase/big-brothers-data";

type Phase = "ready" | "countdown" | "running" | "paused" | "finished";
type RacingHubProps = { embedded?: boolean };
type TrafficCar = { lane: number; y: number; color: string; hit: boolean; pace?: number; targetLane?: number; switchIn?: number; name?: string };
type RaceState = { lane: number; targetLane: number; distance: number; elapsed: number; speed: number; traffic: TrafficCar[]; opponents: TrafficCar[]; spawn: number; stripeOffset: number; last: number };

const newRace = (): RaceState => ({ lane: 1, targetLane: 1, distance: 0, elapsed: 0, speed: 105, traffic: [], opponents: [], spawn: 999, stripeOffset: 0, last: 0 });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const finishDistance = 500;
const roadObjects = [
  { lane: 0, distance: 45 }, { lane: 2, distance: 95 }, { lane: 1, distance: 145 },
  { lane: 0, distance: 195 }, { lane: 2, distance: 245 }, { lane: 1, distance: 295 },
  { lane: 0, distance: 345 }, { lane: 2, distance: 395 }, { lane: 1, distance: 445 },
];

export default function RacingHub({ embedded = false }: RacingHubProps) {
  const [expanded, setExpanded] = useState(!embedded);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const raceRef = useRef<RaceState>(newRace());
  const phaseRef = useRef<Phase>("ready");
  const [phase, setPhase] = useState<Phase>("ready");
  const [countdownValue, setCountdownValue] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [distance, setDistance] = useState(0);
  const [speed, setSpeed] = useState(105);
  const [hits, setHits] = useState(0);
  const [boostActive, setBoostActive] = useState(false);
  const [activeSignal, setActiveSignal] = useState<"left" | "right" | null>(null);
  const signalRef = useRef<"left" | "right" | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const wheelRef = useRef<HTMLButtonElement>(null);
  const steeringStartAngle = useRef<number | null>(null);
  const [businessName, setBusinessName] = useState("Big Brothers Car Wash");
  const [toast, setToast] = useState<{ message: string; kind: "info" | "success" | "error" } | null>(null);
  const showBigBrothersToast = useCallback((message: string, kind: "info" | "success" | "error" = "info") => setToast({ message, kind }), []);
  const controlsRef = useRef({ accelerate: false, brake: false, boost: false, steer: 0 });
  phaseRef.current = phase;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const steeringAngleAt = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    return Math.atan2(y, x);
  };
  const startSteering = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    steeringStartAngle.current = steeringAngleAt(event);
  };
  const steerWheel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (steeringStartAngle.current === null) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(x, y) < 7) return;
    let delta = steeringAngleAt(event) - steeringStartAngle.current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steering = clamp(delta / (Math.PI * 0.62), -1, 1);
    controlsRef.current.steer = steering;
    setWheelRotation(steering * 125);
  };
  const stopSteering = () => {
    steeringStartAngle.current = null;
    controlsRef.current.steer = 0;
    setWheelRotation(0);
  };
  function toggleSignal(signal: "left" | "right") {
    const next = signalRef.current === signal ? null : signal;
    signalRef.current = next;
    setActiveSignal(next);
    if (next) showBigBrothersToast((next === "left" ? "Left" : "Right") + " indicator on.", "info");
  }

  function startRace() {
    if (phaseRef.current === "finished") { raceRef.current = newRace(); setElapsed(0); setDistance(0); setSpeed(105); setHits(0); }
    controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false; setBoostActive(false); signalRef.current = null; setActiveSignal(null); steeringStartAngle.current = null; setWheelRotation(0);
    raceRef.current.last = 0;
    setCountdownValue(3);
    phaseRef.current = "countdown";
    setPhase("countdown");
    showBigBrothersToast("Get ready — your 500 m warm-up starts in 3.", "info");
  }
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = window.setTimeout(() => {
      if (countdownValue <= 1) {
        setCountdownValue(0);
        phaseRef.current = "running";
        setPhase("running");
        showBigBrothersToast("Go! Steer around the road markers and use NOS when you need a burst.", "success");
      } else {
        setCountdownValue(value => value - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [phase, countdownValue]);

  const pauseRace = useCallback(() => {
    if (phaseRef.current === "running") {
      controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false; setBoostActive(false);
      steeringStartAngle.current = null; setWheelRotation(0);
      phaseRef.current = "paused"; setPhase("paused");
    } else if (phaseRef.current === "paused") { raceRef.current.last = 0; phaseRef.current = "running"; setPhase("running"); }
  }, []);
  function restartRace() {
    raceRef.current = newRace(); setElapsed(0); setDistance(0); setSpeed(105); setHits(0); stopSteering(); signalRef.current = null; setActiveSignal(null); controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false;
    setCountdownValue(3); phaseRef.current = "countdown"; setPhase("countdown");
    showBigBrothersToast("Race reset. Get ready to try again.", "info");
  }

  useEffect(() => {
    const stop = subscribeSettings(settings => {
      const value = settings?.businessName;
      if (typeof value === "string" && value.trim()) setBusinessName(value.trim());
    }, () => {});
    return stop;
  }, []);
  useEffect(() => { if (!embedded) document.title = businessName + " · Racing warm-up"; }, [businessName, embedded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frame = 0; let width = 0; let height = 0; let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(320, rect.width); height = Math.max(360, rect.height);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const drawCar = (x: number, y: number, color: string, label = "", signal: "left" | "right" | null = null, blink = false) => {
      const carWidth = Math.min(40, width * .09); const carHeight = carWidth * 1.65;
      context.fillStyle = "rgba(0,0,0,.22)"; context.beginPath(); context.ellipse(x + carWidth / 2, y + carHeight - 2, carWidth * .58, 6, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#151b18"; context.fillRect(x - 3, y + 8, 5, 12); context.fillRect(x + carWidth - 2, y + 8, 5, 12); context.fillRect(x - 3, y + carHeight - 20, 5, 12); context.fillRect(x + carWidth - 2, y + carHeight - 20, 5, 12);
      context.fillStyle = color; context.beginPath(); context.roundRect(x, y, carWidth, carHeight, 8); context.fill();
      context.fillStyle = "#dce9e7"; context.beginPath(); context.roundRect(x + carWidth * .19, y + carHeight * .19, carWidth * .62, carHeight * .25, 4); context.fill();
      context.fillStyle = "#fff4bd"; context.fillRect(x + 5, y + 3, 5, 3); context.fillRect(x + carWidth - 10, y + 3, 5, 3);
      context.fillStyle = "#ff7166"; context.fillRect(x + 5, y + carHeight - 5, 5, 3); context.fillRect(x + carWidth - 10, y + carHeight - 5, 5, 3);
      context.fillStyle = signal && blink ? "#ffb52e" : "#a86d24";
      if (signal === "left") { context.fillRect(x + 2, y + carHeight * .35, 4, 5); context.fillRect(x + 2, y + carHeight - 11, 4, 5); }
      if (signal === "right") { context.fillRect(x + carWidth - 6, y + carHeight * .35, 4, 5); context.fillRect(x + carWidth - 6, y + carHeight - 11, 4, 5); }
      if (label) { context.fillStyle = "#ffffff"; context.font = "bold 8px system-ui"; context.textAlign = "center"; context.fillText(label, x + carWidth / 2, y + carHeight * .65); }
    };
    const draw = (now: number) => {
      const race = raceRef.current; const currentPhase = phaseRef.current;
      const dt = race.last ? Math.min((now - race.last) / 1000, .04) : 0; race.last = now;
      if (currentPhase === "running") {
        race.elapsed += dt;
        race.speed = controlsRef.current.brake ? Math.max(55, race.speed - dt * 58) : controlsRef.current.boost ? Math.min(225, race.speed + dt * 105) : controlsRef.current.accelerate ? Math.min(175, race.speed + dt * 38) : Math.min(155, race.speed + dt * 1.6);
        race.lane = clamp(race.lane + controlsRef.current.steer * dt * (0.95 + race.speed / 210), 0.03, 2.97); race.distance += race.speed * dt / 8; race.stripeOffset = (race.stripeOffset + race.speed * dt * 1.3) % 72;
        const hitObject = roadObjects.find(object => Math.abs(object.distance - race.distance) < 2.4 && Math.abs(object.lane - race.lane) < 0.48);
        if (hitObject) {
          raceRef.current = newRace();
          raceRef.current.last = now;
          controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false;
          steeringStartAngle.current = null; setWheelRotation(0); setBoostActive(false); signalRef.current = null; setActiveSignal(null);
          setElapsed(0); setDistance(0); setSpeed(105); setHits(value => value + 1); setCountdownValue(3);
          phaseRef.current = "countdown"; setPhase("countdown");
          showBigBrothersToast("Marker hit — restarting from the beginning. Steer a little earlier next time.", "error");
        }
        if (race.distance >= finishDistance) { race.distance = finishDistance; showBigBrothersToast("Warm-up complete — nice driving!", "success"); controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false; setBoostActive(false); steeringStartAngle.current = null; setWheelRotation(0); phaseRef.current = "finished"; setPhase("finished"); }
        setElapsed(race.elapsed); setDistance(race.distance); setSpeed(race.speed);
      }
      context.clearRect(0, 0, width, height); context.fillStyle = "#8aa96e"; context.fillRect(0, 0, width, height); context.fillStyle = "#76965e";
      for (let y = -40; y < height + 40; y += 72) { const offset = currentPhase === "running" ? race.stripeOffset : 0; context.fillRect(width * .035, y + offset, width * .045, 26); context.fillRect(width * .92, y + offset, width * .045, 26); }
      const roadLeft = width * .15; const roadWidth = width * .7; context.fillStyle = "#3c4544"; context.fillRect(roadLeft, 0, roadWidth, height); context.fillStyle = "#f5f0d9"; context.fillRect(roadLeft, 0, 4, height); context.fillRect(roadLeft + roadWidth - 4, 0, 4, height);
      context.fillStyle = "#d4d5c6"; for (let laneIndex = 1; laneIndex < 3; laneIndex++) { const x = roadLeft + roadWidth * laneIndex / 3; for (let y = -72 + race.stripeOffset; y < height; y += 72) context.fillRect(x - 2, y, 4, 36); }
      const playerWidth = Math.min(40, width * .09); const playerY = height - 100;
      for (const object of roadObjects) {
        const delta = object.distance - race.distance;
        if (delta < -4 || delta > 72) continue;
        const objectY = playerY - delta * 8;
        const objectX = roadLeft + roadWidth / 3 * (object.lane + .5);
        const radius = Math.max(7, Math.min(12, width * .026));
        context.fillStyle = "#2a332d"; context.beginPath(); context.ellipse(objectX, objectY + radius, radius * 1.1, radius * .35, 0, 0, Math.PI * 2); context.fill();
        context.fillStyle = "#f0a83d"; context.beginPath(); context.moveTo(objectX, objectY - radius); context.lineTo(objectX + radius, objectY + radius); context.lineTo(objectX - radius, objectY + radius); context.closePath(); context.fill();
        context.strokeStyle = "#fff0d2"; context.lineWidth = 2; context.beginPath(); context.moveTo(objectX - radius * .45, objectY + 2); context.lineTo(objectX + radius * .45, objectY + 2); context.stroke();
      }
      drawCar(roadLeft + roadWidth / 3 * (race.lane + .5) - playerWidth / 2, playerY, "#a7d84d", "YOU", signalRef.current, Math.floor(now / 350) % 2 === 0);
      frame = window.requestAnimationFrame(draw);
    };
    const visibilityChange = () => {
      if (document.hidden && phaseRef.current === "running") {
        controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false;
        steeringStartAngle.current = null; setWheelRotation(0);
        phaseRef.current = "paused"; setPhase("paused"); raceRef.current.last = 0;
      }
    };
    resize(); window.addEventListener("resize", resize); document.addEventListener("visibilitychange", visibilityChange); frame = window.requestAnimationFrame(draw);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", visibilityChange); };
  }, [expanded]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (embedded && !expanded) return;
      if (["ArrowLeft", "ArrowRight", "a", "A", "d", "D", "ArrowUp", "ArrowDown", "w", "W", "s", "S"].includes(event.key)) event.preventDefault();
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") controlsRef.current.steer = -1;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") controlsRef.current.steer = 1;
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") controlsRef.current.accelerate = true;
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") controlsRef.current.brake = true;
      if (event.key === "Shift") { controlsRef.current.boost = true; setBoostActive(true); }
      if ((event.key.toLowerCase() === "p" || event.key === "Escape") && !event.repeat) pauseRace();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a" || event.key === "ArrowRight" || event.key.toLowerCase() === "d") controlsRef.current.steer = 0;
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") controlsRef.current.accelerate = false;
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") controlsRef.current.brake = false;
      if (event.key === "Shift") { controlsRef.current.boost = false; setBoostActive(false); }
    };
    const releaseInputs = () => { controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false; setBoostActive(false); steeringStartAngle.current = null; setWheelRotation(0); };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", releaseInputs);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", releaseInputs); controlsRef.current.steer = 0; controlsRef.current.accelerate = false; controlsRef.current.brake = false; controlsRef.current.boost = false; };
  }, [pauseRace, embedded, expanded]);

  if (embedded && !expanded) return <div className="race-inline-promo"><div><p className="big-brothers-eyebrow">BIG BROTHERS RACING · QUICK BREAK</p><h2>Got a minute? Take a lap.</h2><p>A quick 500 m drive. Find your rhythm and get back to your wash booking whenever you&apos;re ready.</p></div><button type="button" className="big-brothers-button primary" onClick={() => setExpanded(true)}>Play now ↗</button></div>;
  return <div className={"vula race-hub" + (embedded ? " race-hub-embedded" : "")}>
    {toast && <div role="status" aria-live="polite" style={{ position: "fixed", zIndex: 1000, top: "max(12px, env(safe-area-inset-top))", left: "50%", transform: "translateX(-50%)", width: "min(92vw, 460px)", padding: "12px 16px", borderRadius: 12, color: "#fff", background: toast.kind === "error" ? "#8f2929" : toast.kind === "success" ? "#245c36" : "#26352d", boxShadow: "0 8px 28px rgba(0,0,0,.25)", fontSize: 14, fontWeight: 600, textAlign: "center", pointerEvents: "none" }}>{toast.message}</div>}
    {!embedded && <><div className="big-brothers-status"><span className="status-dot online" />Big Brothers Racing · 2D warm-up · local test only</div>
    <header className="big-brothers-nav"><Link href="/" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Racing warm-up</small></span></Link><nav><Link href="/#request">Book a wash</Link><Link href="/#my-wash">My Wash</Link></nav></header>
    <section className="big-brothers-section warmup-intro"><p className="big-brothers-eyebrow">BIG BROTHERS RACING · MECHANICS TEST</p><h1>Take the warm-up lap.</h1><p>A simple top-down 2D driving test. Steer freely, hit NOS for a burst of speed, and finish 500 m. We can tune these mechanics before bringing them into the in-account racing experience.</p><p className="warmup-boundary">This prototype does not use accounts, credits, upgrades, bookings, loyalty or receipts. Your controls and race run only in this open page.</p></section></>}
    {embedded && <div className="race-inline-heading"><div><p className="big-brothers-eyebrow">BIG BROTHERS RACING · 500 M</p><h2>Take the warm-up lap.</h2><p>Steer freely and use NOS. Finish the run, then get back to your car wash.</p></div><button type="button" className="big-brothers-button secondary" onClick={() => { if (phaseRef.current === "running") pauseRace(); setExpanded(false); }}>Close game ×</button></div>}
    <section className="big-brothers-section warmup-game">
      <div className="warmup-hud" aria-live="polite"><div><span>Distance</span><strong>{Math.round(distance)} <small>/ {finishDistance} m</small></strong></div><div><span>Speed</span><strong>{Math.round(speed)} <small>km/h</small></strong></div><div><span>Time</span><strong>{elapsed.toFixed(1)} <small>s</small></strong></div><div><span>Markers hit</span><strong>{hits}</strong></div></div>
      <div className="warmup-canvas-wrap"><canvas ref={canvasRef} aria-label="Top-down 2D road racing warm-up. Drag the virtual steering wheel on mobile or hold the left and right keys on desktop." role="img" />
        {phase !== "running" && <div className="warmup-overlay"><span>{phase === "ready" ? "READY ON THE GRID" : phase === "countdown" ? "GET READY" : phase === "paused" ? "RACE PAUSED" : "FINISH LINE"}</span><strong>{phase === "ready" ? "Start when you are." : phase === "countdown" ? String(countdownValue || 1) : phase === "paused" ? "Take your time." : "Warm-up complete."}</strong><p>{phase === "ready" ? "Drag the steering wheel to turn, or hold ← / → on desktop." : phase === "countdown" ? "Take your position. The road is clear ahead." : phase === "paused" ? "Your timer is stopped." : "You finished in " + elapsed.toFixed(1) + " seconds."}</p></div>}
      </div>
      <div className="warmup-controls"><div className="warmup-steering"><button ref={wheelRef} type="button" className="warmup-wheel" aria-label="Virtual steering wheel. Drag around the wheel to steer." aria-describedby="steering-help" disabled={phase !== "running"} style={{ transform: `rotate(${wheelRotation}deg)` }} onPointerDown={startSteering} onPointerMove={steerWheel} onPointerUp={stopSteering} onPointerCancel={stopSteering} onLostPointerCapture={stopSteering}><span className="wheel-ring"><span className="wheel-spoke vertical"/><span className="wheel-spoke horizontal"/><span className="wheel-hub"/></span><span className="wheel-caption">STEER</span></button><span id="steering-help" className="steering-caption">Drag the wheel left or right</span><div className="warmup-signals" aria-label="Turn indicators"><button type="button" aria-label="Toggle left indicator" disabled={phase !== "running"} aria-pressed={activeSignal === "left"} className={activeSignal === "left" ? "signal-active" : ""} onClick={() => toggleSignal("left")}>← Signal</button><button type="button" aria-label="Toggle right indicator" disabled={phase !== "running"} aria-pressed={activeSignal === "right"} className={activeSignal === "right" ? "signal-active" : ""} onClick={() => toggleSignal("right")}>Signal →</button></div></div><div className="warmup-driving"><button type="button" aria-label="Accelerate" disabled={phase !== "running"} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controlsRef.current.accelerate = true; }} onPointerUp={() => { controlsRef.current.accelerate = false; }} onPointerLeave={() => { controlsRef.current.accelerate = false; }} onPointerCancel={() => { controlsRef.current.accelerate = false; }}>Accelerate ↑</button><button type="button" aria-label="Brake" disabled={phase !== "running"} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controlsRef.current.brake = true; }} onPointerUp={() => { controlsRef.current.brake = false; }} onPointerLeave={() => { controlsRef.current.brake = false; }} onPointerCancel={() => { controlsRef.current.brake = false; }}>Brake ↓</button><button type="button" className="nos-button" aria-label="NOS boost" disabled={phase !== "running"} aria-pressed={boostActive} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); controlsRef.current.boost = true; setBoostActive(true); }} onPointerUp={() => { controlsRef.current.boost = false; setBoostActive(false); }} onPointerLeave={() => { controlsRef.current.boost = false; setBoostActive(false); }} onPointerCancel={() => { controlsRef.current.boost = false; setBoostActive(false); }}>NOS ⚡</button></div><div className="warmup-actions">{phase === "ready" ? <button type="button" className="big-brothers-button primary" onClick={startRace}>Start race ↗</button> : phase === "countdown" ? <button type="button" className="big-brothers-button primary" disabled>Starting {countdownValue || 1}…</button> : phase === "running" ? <button type="button" className="big-brothers-button primary" onClick={pauseRace}>Pause race Ⅱ</button> : phase === "paused" ? <button type="button" className="big-brothers-button primary" onClick={pauseRace}>Resume race ▶</button> : <button type="button" className="big-brothers-button primary" onClick={startRace}>Run again ↗</button>}<button type="button" className="big-brothers-button secondary" onClick={restartRace}>Restart race ↻</button></div></div>
      <p className="warmup-help">Steer: drag the wheel on phones, or hold ← / → or A / D on desktop · Accelerate: ↑ / W · Brake: ↓ / S · NOS: hold the boost button or Shift · Indicators: ← Signal / Signal → · Pause: P / Esc.</p>
    </section>
    {!embedded && <footer className="big-brothers-footer"><Link href="/" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></Link><Link href="/#request">Book a wash</Link><Link href="/#my-wash">My Wash</Link></footer>}
  </div>;
}