import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { createReceiptToken, receiptTokenHash, requireBigBrothersStaff } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { app, uid } = await requireBigBrothersStaff(request);
    const body = await request.json().catch(() => null) as { queueEntryId?: unknown; amount?: unknown; tipAmount?: unknown; paymentStatus?: unknown } | null;
    const queueEntryId = typeof body?.queueEntryId === "string" ? body.queueEntryId.trim() : "";
    const amount = body?.amount;
    const tipAmount = body?.tipAmount === undefined ? 0 : body.tipAmount;
    const paymentStatus = body?.paymentStatus;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(queueEntryId)) return NextResponse.json({ error: "Choose a valid queue entry." }, { status: 400 });
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 1000000) return NextResponse.json({ error: "Enter a valid final agreed charge in BWP." }, { status: 400 });
    if (typeof tipAmount !== "number" || !Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 1000000) return NextResponse.json({ error: "Enter a valid optional tip amount in BWP." }, { status: 400 });
    if (!["paid", "unpaid", "refunded"].includes(String(paymentStatus))) return NextResponse.json({ error: "Choose a valid payment status." }, { status: 400 });

    const db = getFirestore(app);
    const queueRef = db.doc(`queueEntries/${queueEntryId}`);
    const queueSnap = await queueRef.get();
    if (!queueSnap.exists) return NextResponse.json({ error: "That queue entry could not be found." }, { status: 404 });
    const job = queueSnap.data() || {};
    if (job.status !== "completed") return NextResponse.json({ error: "Mark the wash completed before creating its receipt." }, { status: 409 });

    const receiptRef = db.doc(`receipts/${queueEntryId}`);
    const existing = await receiptRef.get();
    const existingData = existing.data() || {};
    const expiry = Date.parse(String(existingData.expiresAt || ""));
    if (existing.exists && existingData.revoked !== true && existingData.token && Number.isFinite(expiry) && expiry > Date.now()) {
      await receiptRef.set({ amount, tipAmount, paymentStatus: String(paymentStatus), updatedAt: new Date().toISOString() }, { merge: true });
      const url = new URL("/receipt/" + String(existingData.token), request.url).toString();
      return NextResponse.json({ url, receiptRef: String(existingData.receiptRef || ""), reused: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const token = createReceiptToken();
    const tokenHash = receiptTokenHash(token);
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const receiptNumber = "BB-" + createdAt.slice(0, 10).replaceAll("-", "") + "-" + token.slice(0, 6).toUpperCase();
    const record = {
      queueEntryId,
      token,
      tokenHash,
      receiptRef: receiptNumber,
      customerId: String(job.customerId || ""),
      customerName: String(job.customerName || ""),
      phone: String(job.phone || ""),
      email: String(job.email || ""),
      vehicleType: String(job.vehicleType || ""),
      vehicleRegistration: String(job.vehicleRegistration || ""),
      serviceName: String(job.serviceName || "Car wash service"),
      amount,
      tipAmount,
      paymentStatus: String(paymentStatus),
      joinedAt: String(job.createdAt || ""),
      completedAt: String(job.updatedAt || createdAt),
      createdAt,
      expiresAt,
      createdBy: uid,
      revoked: false,
      ...(existingData.claimedBy ? { claimedBy: existingData.claimedBy, claimedAt: existingData.claimedAt } : {}),
    };
    await db.runTransaction(async transaction => {
      transaction.set(receiptRef, record);
      transaction.set(db.doc(`receiptTokens/${tokenHash}`), { queueEntryId, createdAt, expiresAt });
    });
    const url = new URL("/receipt/" + token, request.url).toString();
    return NextResponse.json({ url, receiptRef: receiptNumber, reused: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt link could not be created.";
    const status = /staff sign-in/i.test(message) ? 401 : /staff access/i.test(message) ? 403 : /FIREBASE_ADMIN_KEY|credentials|service-account/i.test(message) ? 503 : 400;
    console.error("Big Brothers receipt creation failed:", message);
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
