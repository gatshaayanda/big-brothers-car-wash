import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { bigBrothersAdminApp, publicReceipt } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Sign in with Google or verified phone before viewing saved receipts." }, { status: 401 });
    const app = bigBrothersAdminApp();
    const decoded = await getAuth(app).verifyIdToken(token);
    const provider = String(decoded.firebase?.sign_in_provider || "");
    if (!["google.com", "phone"].includes(provider)) return NextResponse.json({ error: "Use a verified Google or phone sign-in to view saved receipts." }, { status: 403 });
    const db = getFirestore(app);
    const snapshot = await db.collection("receipts").where("customerId", "==", decoded.uid).get();
    const receipts = snapshot.docs.map(doc => {
      const value = doc.data();
      return { ...publicReceipt(value), token: String(value.token || ""), queueEntryId: String(value.queueEntryId || "") };
    }).filter(receipt => receipt.token && receipt.expiresAt && Date.parse(receipt.expiresAt) > Date.now())
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
    return NextResponse.json({ receipts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Saved receipts could not be loaded.";
    const status = /FIREBASE_ADMIN_KEY|credentials|service-account/i.test(message) ? 503 : 401;
    console.error("Big Brothers customer receipts lookup failed:", message);
    return NextResponse.json({ error: status === 503 ? "Saved receipts are temporarily unavailable because secure server access is not configured." : "Saved receipts could not be loaded. Sign in again and retry." }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
