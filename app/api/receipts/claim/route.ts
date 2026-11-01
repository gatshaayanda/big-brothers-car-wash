import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { bigBrothersAdminApp, receiptTokenHash } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const idToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!idToken) return NextResponse.json({ error: "Sign in with Google before claiming this job." }, { status: 401 });
    const app = bigBrothersAdminApp();
    const decoded = await getAuth(app).verifyIdToken(idToken);
    const provider = String(decoded.firebase?.sign_in_provider || "");
    if (!["google.com", "phone"].includes(provider)) {
      return NextResponse.json({ error: "Use a verified Google or phone sign-in to claim this job." }, { status: 403 });
    }
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    const token = typeof body?.token === "string" ? body.token : "";
    if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return NextResponse.json({ error: "The receipt link is invalid." }, { status: 400 });
    const db = getFirestore(app);
    const tokenHash = receiptTokenHash(token);
    const tokenSnap = await db.doc(`receiptTokens/${tokenHash}`).get();
    if (!tokenSnap.exists) return NextResponse.json({ error: "This receipt link is invalid, expired or has been revoked." }, { status: 404 });
    const queueEntryId = String(tokenSnap.data()?.queueEntryId || "");
    if (!queueEntryId) return NextResponse.json({ error: "This receipt link cannot be used to claim a job." }, { status: 404 });
    const receiptRef = db.doc(`receipts/${queueEntryId}`);
    const queueRef = db.doc(`queueEntries/${queueEntryId}`);
    const now = new Date().toISOString();
    await db.runTransaction(async transaction => {
      const receiptSnap = await transaction.get(receiptRef);
      const queueSnap = await transaction.get(queueRef);
      if (!receiptSnap.exists || !queueSnap.exists) throw new Error("This receipt no longer matches a completed wash.");
      const receipt = receiptSnap.data() || {};
      const expiresAt = Date.parse(String(receipt.expiresAt || ""));
      if (receipt.revoked === true || receipt.tokenHash !== tokenHash || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error("This receipt link is invalid, expired or has been revoked.");
      if (receipt.claimedBy && receipt.claimedBy !== decoded.uid) throw new Error("This job has already been claimed by another account. Contact staff if you believe this is a mistake.");
      transaction.update(queueRef, { customerId: decoded.uid, updatedAt: now });
      transaction.set(receiptRef, { customerId: decoded.uid, claimedBy: decoded.uid, claimedAt: now }, { merge: true });
    });
    return NextResponse.json({ claimed: true, queueEntryId }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "This job could not be claimed.";
    const status = /sign in|token/i.test(message) ? 401 : /already been claimed/i.test(message) ? 409 : /invalid|expired|revoked|completed wash/i.test(message) ? 404 : 500;
    console.error("Big Brothers receipt claim failed:", message);
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
