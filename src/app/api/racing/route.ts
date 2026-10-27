import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
const divisions = [
  { name: "Kart Rookie", tracks: ["Gaborone Dust Loop", "Tlokweng Sprint", "Makgadikgadi Bend"] },
  { name: "Pro Circuit", tracks: ["Kgale Ridge Circuit", "Okavango Run", "Kalahari GP"] },
  { name: "International Series", tracks: ["Alpine Ring", "Riviera Sprint", "Old Town Grand Prix"] },
  { name: "World Apex", tracks: ["Neon Meridian", "Orbital Crown", "Apex Zero"] },
];
const rewards = [0, 150, 75, 45];
type Racer = { id: string; alias: string; division: number; wins: number; credits: number; upgrade: number; best: Record<string, number>; history: Array<Record<string, unknown>>; createdAt: string; updatedAt: string };
function adminApp() {
  const existing = getApps().find(app => app.name === "big-brothers-operations");
  if (existing) return existing;
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) throw new Error("Racing sync is not configured on the server.");
  const serviceAccount = JSON.parse(raw) as Record<string, unknown>;
  return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: "vulas-car-wash" }, "big-brothers-operations");
}
async function identity(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to synchronize your racing career.");
  const app = adminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  return { app, uid: decoded.uid };
}
function cleanAlias(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 18) : "";
}
function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : "Racing request failed.";
  const status = /sign in|token|authorization|admin access/i.test(message) ? 401 : /not found|unavailable/i.test(message) ? 404 : 400;
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
export async function GET(request: Request) {
  try {
    const { app, uid } = await identity(request);
    const store = getFirestore(app);
    const url = new URL(request.url);
    if (url.searchParams.get("admin") === "1") {
      const staff = await store.doc(`admins/${uid}`).get();
      if (!staff.exists || !["owner", "staff"].includes(String(staff.data()?.role))) {
        return NextResponse.json({ error: "Staff access required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
      }
      const [profiles, results, issues] = await Promise.all([
        store.collection("racingProfiles").limit(200).get(),
        store.collection("racingResults").orderBy("createdAt", "desc").limit(100).get(),
        store.collection("racingIssues").orderBy("createdAt", "desc").limit(100).get(),
      ]);
      return NextResponse.json({
        profiles: profiles.docs.map(d => ({ racers: Array.isArray(d.data().racers) ? d.data().racers.map((r: Record<string, unknown>) => ({ id: r.id, alias: r.alias, division: r.division, updatedAt: r.updatedAt })) : [] })),
        results: results.docs.map(d => { const r = d.data(); return { id: d.id, alias: r.alias, track: r.track, division: r.division, place: r.place, time: r.time, credits: r.credits, createdAt: r.createdAt, verified: r.verified }; }),
        issues: issues.docs.map(d => { const r = d.data(); return { id: d.id, alias: r.alias, track: r.track, category: r.category, description: r.description, status: r.status, createdAt: r.createdAt }; }),
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const profile = await store.doc(`racingProfiles/${uid}`).get();
    const feed = await store.collection("racingResults").orderBy("createdAt", "desc").limit(40).get();
    return NextResponse.json({
      racers: profile.exists && Array.isArray(profile.data()?.racers) ? profile.data()!.racers : [],
      results: feed.docs.map(d => { const r = d.data(); return { id: d.id, alias: r.alias, track: r.track, division: r.division, place: r.place, time: r.time, credits: r.credits, createdAt: r.createdAt, verified: r.verified }; }),
      sync: "server",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
export async function POST(request: Request) {
  try {
    const { app, uid } = await identity(request);
    const body = await request.json() as Record<string, unknown>;
    const store = getFirestore(app);
    const profileRef = store.doc(`racingProfiles/${uid}`);
    const now = new Date().toISOString();
    if (body.action === "report") {
      const category = String(body.category || "other");
      const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : "";
      const racerId = String(body.racerId || "").slice(0, 80);
      const track = String(body.track || "").slice(0, 120);
      if (!["bug", "controls", "save-sync", "other"].includes(category) || description.length < 8) {
        return NextResponse.json({ error: "Choose a report type and describe the issue in at least eight characters." }, { status: 400 });
      }
      const profile = await profileRef.get();
      const racers = (profile.data()?.racers || []) as Racer[];
      const racer = racers.find(r => r.id === racerId);
      const reportRef = await store.collection("racingIssues").add({
        uid, racerId: racer?.id || "", alias: racer?.alias || "Guest racer",
        track: divisions.some(d => d.tracks.includes(track)) ? track : "",
        category, description, status: "open", createdAt: now,
      });
      return NextResponse.json({ id: reportRef.id, status: "open" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "create") {
      const alias = cleanAlias(body.alias);
      if (alias.length < 2) return NextResponse.json({ error: "Choose a racer alias with at least two characters." }, { status: 400 });
      const racer: Racer = { id: crypto.randomUUID(), alias, division: 0, wins: 0, credits: 250, upgrade: 0, best: {}, history: [], createdAt: now, updatedAt: now };
      await store.runTransaction(async tx => {
        const snap = await tx.get(profileRef);
        const racers = snap.exists && Array.isArray(snap.data()?.racers) ? snap.data()!.racers as Racer[] : [];
        if (racers.length >= 10) throw new Error("This account already has 10 racer profiles.");
        tx.set(profileRef, { racers: [...racers, racer], updatedAt: now }, { merge: true });
      });
      return NextResponse.json({ racer, sync: "server" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "reset") {
      const racerId = String(body.racerId || "");
      await store.runTransaction(async tx => {
        const snap = await tx.get(profileRef);
        if (!snap.exists) return;
        const racers = (snap.data()?.racers || []) as Racer[];
        tx.set(profileRef, { racers: racers.filter(r => r.id !== racerId), updatedAt: now }, { merge: true });
      });
      return NextResponse.json({ ok: true, sync: "server" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "upgrade") {
      const racerId = String(body.racerId || "");
      let updated: Racer | undefined;
      await store.runTransaction(async tx => {
        const snap = await tx.get(profileRef);
        if (!snap.exists) throw new Error("Racer profile not found.");
        const racers = (snap.data()?.racers || []) as Racer[];
        const next = racers.map(r => {
          if (r.id !== racerId) return r;
          const cost = (r.upgrade + 1) * 100;
          if (r.upgrade >= 5 || r.credits < cost) throw new Error("Not enough virtual credits for this upgrade.");
          updated = { ...r, credits: r.credits - cost, upgrade: r.upgrade + 1, updatedAt: now };
          return updated;
        });
        if (!updated) throw new Error("Racer profile not found.");
        tx.set(profileRef, { racers: next, updatedAt: now }, { merge: true });
      });
      return NextResponse.json({ racer: updated, sync: "server" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "start") {
      const racerId = String(body.racerId || "");
      const track = String(body.track || "");
      if (!divisions.some(d => d.tracks.includes(track))) {
        return NextResponse.json({ error: "Choose a valid Vula circuit." }, { status: 400 });
      }
      const profile = await profileRef.get();
      const racers = (profile.data()?.racers || []) as Racer[];
      const racer = racers.find(r => r.id === racerId);
      if (!profile.exists || !racer) {
        return NextResponse.json({ error: "Create or select your racer before starting." }, { status: 400 });
      }
      const trackDivision = divisions.findIndex(d => d.tracks.includes(track));
      if (trackDivision > racer.division) {
        return NextResponse.json({ error: "This track is locked until you reach its division." }, { status: 403 });
      }
      const raceId = crypto.randomUUID();
      await store.doc(`racingSessions/${uid}_${raceId}`).create({ uid, racerId, track, startedAt: Date.now(), status: "started" });
      return NextResponse.json({ raceId, sync: "server" }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "finish") {
      const racerId = String(body.racerId || "");
      const track = String(body.track || "");
      const raceId = String(body.raceId || "");
      if (!raceId || raceId.length > 100 || !divisions.some(d => d.tracks.includes(track))) {
        return NextResponse.json({ error: "Race result failed validation. Please race again online." }, { status: 400 });
      }
      const resultRef = store.doc(`racingResults/${uid}_${raceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`);
      const sessionRef = store.doc(`racingSessions/${uid}_${raceId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)}`);
      const finishedAt = Date.now();
      let response: Record<string, unknown> = {};
      await store.runTransaction(async tx => {
        const existingResult = await tx.get(resultRef);
        if (existingResult.exists) {
          const existingProfile = await tx.get(profileRef);
          const savedRacer = ((existingProfile.data()?.racers || []) as Racer[]).find(r => r.id === racerId);
          const saved = existingResult.data() || {};
          response = {
            racer: savedRacer,
            result: { id: raceId, track: saved.track, place: saved.place, time: saved.time, credits: saved.credits, at: saved.createdAt, verified: saved.verified },
            duplicate: true,
            sync: "server",
          };
          return;
        }
        const session = await tx.get(sessionRef);
        if (!session.exists || session.data()?.status !== "started" || session.data()?.racerId !== racerId || session.data()?.track !== track) throw new Error("Race session expired or does not match. Start another race.");
        const serverElapsed = (finishedAt - Number(session.data()?.startedAt || finishedAt)) / 1000;
        if (!Number.isFinite(serverElapsed) || serverElapsed < 35 || serverElapsed > 240) throw new Error("Race duration failed server validation. Please race again.");
        const profile = await tx.get(profileRef);
        if (!profile.exists) throw new Error("Create a racer profile before recording a result.");
        const racers = (profile.data()?.racers || []) as Racer[];
        const current = racers.find(r => r.id === racerId);
        if (!current) throw new Error("Racer profile not found.");
        const normalizedTime = Number(serverElapsed.toFixed(2));
        const seed = Array.from(raceId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const rivalOne = 34 + (seed % 1300) / 100 + Math.max(0, 2 - current.upgrade) * 1.2;
        const rivalTwo = 37 + ((seed * 7) % 1100) / 100 + Math.max(0, 1 - current.upgrade) * .8;
        const place = [normalizedTime, rivalOne, rivalTwo].sort((a, b) => a - b).indexOf(normalizedTime) + 1;
        const credits = rewards[place];
        const historyItem = { id: raceId, track, place, time: normalizedTime, credits, at: now, verified: true };
        const best = { ...current.best, [track]: Math.min(Number(current.best?.[track] ?? Infinity), normalizedTime) };
        const history = [historyItem, ...(current.history || []).filter(h => h.id !== raceId)].slice(0, 50);
        const wins = current.wins + (place === 1 ? 1 : 0);
        let division = current.division;
        if (wins >= (division + 1) * 3 && division < 3) division++;
        else if (history.length >= 4 && wins === 0 && division > 0) division--;
        const updated = { ...current, division, wins, credits: current.credits + credits, best, history, updatedAt: now };
        tx.set(profileRef, { racers: racers.map(r => r.id === racerId ? updated : r), updatedAt: now }, { merge: true });
        tx.set(resultRef, { uid, racerId, alias: current.alias, track, division: current.division, place, time: normalizedTime, credits, createdAt: now, verified: true });
        tx.set(sessionRef, { status: "completed", finishedAt, elapsed: normalizedTime }, { merge: true });
        response = { racer: updated, result: historyItem, sync: "server" };
      });
      return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown racing action." }, { status: 400 });
  } catch (error) { return jsonError(error); }
}
