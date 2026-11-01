import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { bigBrothersAdminApp, requireBigBrothersStaff } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";
const DAY = 24 * 60 * 60 * 1000;

async function customer(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to your customer account first.");
  const app = bigBrothersAdminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  return { app, uid: decoded.uid };
}

// Called when an authenticated customer opens their account. This is a private,
// first-party signal; it does not track anonymous browsing or infer identity.
export async function POST(request: Request) {
  try {
    const { app, uid } = await customer(request);
    const db = getFirestore(app);
    const now = new Date();
    const at = now.toISOString();
    const profileRef = db.doc("customers/" + uid);
    const engagementRef = db.doc("customerEngagement/" + uid);
    await db.runTransaction(async tx => {
      const [profileSnap, engagementSnap] = await Promise.all([tx.get(profileRef), tx.get(engagementRef)]);
      const profile = profileSnap.data() || {};
      const current = engagementSnap.data() || {};
      const count = Number(current.accountOpenCount || 0);
      const hasExistingAction = Boolean(current.lastBookingAt || current.lastWalkInAt);
      const next = {
        customerId: uid,
        customerName: String(profile.name || "").slice(0, 120),
        phone: String(profile.phone || "").slice(0, 40),
        firstAccountOpenedAt: String(current.firstAccountOpenedAt || at),
        lastAccountOpenedAt: at,
        accountOpenCount: Math.min(1000000, count + 1),
        followUpStatus: current.followUpStatus === "do-not-contact" || current.followUpStatus === "declined" ? current.followUpStatus : (hasExistingAction ? "customer" : (current.followUpStatus || "waiting")),
        nextFollowUpAt: current.nextFollowUpAt || (hasExistingAction ? "" : new Date(now.getTime() + DAY).toISOString()),
        updatedAt: at,
      };
      tx.set(engagementRef, next, { merge: true });
    });
    return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Account activity could not be recorded.";
    const status = /sign in/i.test(message) ? 401 : 503;
    return NextResponse.json({ recorded: false, error: status === 401 ? message : "Account activity tracking is temporarily unavailable." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET() {
  try {
    const { app } = await requireBigBrothersStaff(request);
    const db = getFirestore(app);
    const now = Date.now();
    const [engagements, bookings, queue, prefs, customers, publicViews] = await Promise.all([
      db.collection("customerEngagement").orderBy("lastAccountOpenedAt", "desc").limit(250).get(),
      db.collection("bookings").orderBy("createdAt", "desc").limit(500).get(),
      db.collection("queueEntries").orderBy("createdAt", "desc").limit(500).get(),
      db.collection("reminderPreferences").get(),
      db.collection("customers").limit(500).get(),
      db.collection("publicSiteEvents").where("createdAt", ">=", new Date(now - 7 * DAY).toISOString()).get(),
    ]);
    const bookingByUid = new Map<string, string>();
    for (const doc of bookings.docs) { const d = doc.data(); const uid = String(d.customerId || ""); if (uid && !bookingByUid.has(uid)) bookingByUid.set(uid, String(d.createdAt || "")); }
    const queueByUid = new Map<string, string>();
    for (const doc of queue.docs) { const d = doc.data(); const uid = String(d.customerId || ""); if (uid && !queueByUid.has(uid)) queueByUid.set(uid, String(d.createdAt || "")); }
    const preferenceByUid = new Map<string, Record<string, unknown>>();
    for (const item of prefs.docs) preferenceByUid.set(item.id, item.data());
    const profileByUid = new Map<string, Record<string, unknown>>();
    for (const item of customers.docs) profileByUid.set(item.id, item.data());
    const leads = engagements.docs.map(doc => {
      const d = doc.data(); const uid = doc.id;
      const lastBookingAt = bookingByUid.get(uid) || "";
      const lastWalkInAt = queueByUid.get(uid) || "";
      const actionTimes = [lastBookingAt, lastWalkInAt].filter(Boolean).sort();
      const lastActionAt = actionTimes.length ? actionTimes[actionTimes.length - 1] : "";
      const openedAt = String(d.lastAccountOpenedAt || "");
      const actedAfterOpen = Boolean(lastActionAt && lastActionAt >= openedAt);
      const pref = preferenceByUid.get(uid) || {};
      const profile = profileByUid.get(uid) || {};
      const phone = String(profile.phone || d.phone || "");
      const status = actedAfterOpen ? "customer" : String(d.followUpStatus || "waiting");
      const dueAt = Date.parse(String(d.nextFollowUpAt || ""));
      const optedIn = pref.whatsappFollowUpEnabled === true;
      return {
        id: uid,
        name: String(profile.name || d.customerName || "Customer"),
        phone,
        openedAt,
        openCount: Number(d.accountOpenCount || 1),
        lastBookingAt,
        lastWalkInAt,
        lastContactAt: String(d.lastContactAt || ""),
        followUpStep: Number(d.followUpStep || 0),
        status,
        optedIn,
        due: !actedAfterOpen && optedIn && status !== "do-not-contact" && status !== "declined" && Number.isFinite(dueAt) && dueAt <= now && /^\+?[0-9 ()-]{8,20}$/.test(phone),
      };
    }).filter(item => item.status !== "customer" && item.status !== "do-not-contact" && item.status !== "declined");
    const sevenDaysAgo = new Date(now - 7 * DAY).toISOString();
    const accountOpens7d = engagements.docs.filter(doc => String(doc.data().lastAccountOpenedAt || "") >= sevenDaysAgo).length;
    const due = leads.filter(item => item.due).sort((a,b) => a.openedAt.localeCompare(b.openedAt));
    return NextResponse.json({
      metrics: { publicViews7d: publicViews.size, trackedAccounts: engagements.size, accountOpens7d, bookingRequests: bookings.size, walkInEntries: queue.size, followUpDue: due.length },
      leads: leads.sort((a,b) => b.openedAt.localeCompare(a.openedAt)),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer activity could not be loaded.";
    const status = /staff sign-in/i.test(message) ? 401 : /staff access/i.test(message) ? 403 : 503;
    return NextResponse.json({ error: status === 503 ? "Customer activity is temporarily unavailable." : message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: Request) {
  try {
    const { app, uid: staffUid } = await requireBigBrothersStaff(request);
    const body = await request.json().catch(() => null) as { customerId?: unknown; action?: unknown } | null;
    const customerId = typeof body?.customerId === "string" ? body.customerId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(customerId) || !["contacted", "declined"].includes(action)) return NextResponse.json({ error: "Choose a valid customer action." }, { status: 400 });
    const db = getFirestore(app);
    const ref = db.doc("customerEngagement/" + customerId);
    const preferenceRef = db.doc("reminderPreferences/" + customerId);
    const at = new Date().toISOString();
    await db.runTransaction(async tx => {
      const [snap, preferenceSnap] = await Promise.all([tx.get(ref), tx.get(preferenceRef)]);
      if (!snap.exists) throw new Error("CUSTOMER_ACTIVITY_NOT_FOUND");
      if (action === "contacted" && preferenceSnap.data()?.whatsappFollowUpEnabled !== true) throw new Error("WHATSAPP_CONSENT_REQUIRED");
      const data = snap.data() || {};
      const step = Math.min(2, Number(data.followUpStep || 0) + 1);
      tx.set(ref, action === "declined"
        ? { followUpStatus: "declined", doNotContact: true, nextFollowUpAt: "", declinedAt: at, updatedAt: at, updatedBy: staffUid }
        : { followUpStatus: step >= 2 ? "complete" : "contacted", followUpStep: step, lastContactAt: at, nextFollowUpAt: step >= 2 ? "" : new Date(Date.now() + 3 * DAY).toISOString(), updatedAt: at, updatedBy: staffUid }, { merge: true });
    });
    return NextResponse.json({ updated: true, action }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Customer follow-up could not be saved.";
    const status = /staff sign-in/i.test(message) ? 401 : /staff access/i.test(message) ? 403 : message === "CUSTOMER_ACTIVITY_NOT_FOUND" ? 404 : message === "WHATSAPP_CONSENT_REQUIRED" ? 409 : 503;
    return NextResponse.json({ error: status === 503 ? "Customer follow-up could not be saved." : message === "WHATSAPP_CONSENT_REQUIRED" ? "The customer has not enabled WhatsApp follow-ups, or has switched consent off." : message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
