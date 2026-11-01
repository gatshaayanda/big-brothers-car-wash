import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { bigBrothersAdminApp, createWalkInTicketReceipt, publicReceipt } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Your customer session is required to view saved receipts." }, { status: 401 });
    const app = bigBrothersAdminApp();
    const decoded = await getAuth(app).verifyIdToken(token);
    const db = getFirestore(app);

    // A verified Firebase ID token scopes every lookup to this customer's UID.
    // Backfill walk-in tickets for already-saved queue entries without asking
    // the customer or staff to submit the service again.
    const queueSnapshot = await db.collection("queueEntries").where("customerId", "==", decoded.uid).get();
    for (const queueDoc of queueSnapshot.docs) {
      const queueEntry = queueDoc.data();
      const existing = await db.doc("receipts/" + queueDoc.id).get();
      if (!existing.exists) await createWalkInTicketReceipt(queueDoc.id, queueEntry);
    }

    const snapshot = await db.collection("receipts").where("customerId", "==", decoded.uid).get();
    const receipts = snapshot.docs.map(doc => {
      const value = doc.data();
      const receipt = publicReceipt(value);
      return {
        ...receipt,
        token: String(value.token || ""),
        queueEntryId: String(value.queueEntryId || doc.id),
      };
    }).filter(receipt => receipt.token && receipt.expiresAt && Date.parse(receipt.expiresAt) > Date.now())
      .sort((a, b) => (b.completedAt || b.joinedAt || b.createdAt).localeCompare(a.completedAt || a.joinedAt || a.createdAt));
    return NextResponse.json({ receipts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Saved receipts could not be loaded.";
    const status = /FIREBASE_ADMIN_KEY|credentials|service-account/i.test(message) ? 503 : 401;
    console.error("Big Brothers customer receipts lookup failed:", message);
    return NextResponse.json({ error: status === 503 ? "Saved receipts are temporarily unavailable because secure server access is not configured." : "Saved receipts could not be loaded. Sign in again and retry." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
