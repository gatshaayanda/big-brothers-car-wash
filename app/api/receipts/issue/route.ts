import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { bigBrothersAdminApp, createWalkInTicketReceipt } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Customer session is required to issue this walk-in receipt." }, { status: 401 });

    const app = bigBrothersAdminApp();
    const decoded = await getAuth(app).verifyIdToken(token);
    const body = await request.json().catch(() => null) as { queueEntryId?: unknown } | null;
    const queueEntryId = typeof body?.queueEntryId === "string" ? body.queueEntryId.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(queueEntryId)) {
      return NextResponse.json({ error: "A valid walk-in reference is required." }, { status: 400 });
    }

    const db = getFirestore(app);
    const queueSnap = await db.doc("queueEntries/" + queueEntryId).get();
    if (!queueSnap.exists) return NextResponse.json({ error: "The saved walk-in could not be found." }, { status: 404 });
    const job = queueSnap.data() || {};
    if (String(job.customerId || "") !== decoded.uid) {
      return NextResponse.json({ error: "This walk-in does not belong to the signed-in customer session." }, { status: 403 });
    }

    const issued = await createWalkInTicketReceipt(queueEntryId, job);
    const url = new URL("/receipt/" + issued.token, request.url).toString();
    return NextResponse.json({ issued: true, url, receiptRef: issued.receiptRef, reused: issued.reused }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Walk-in receipt could not be issued.";
    const status = /FIREBASE_ADMIN_KEY|credentials|service-account/i.test(message) ? 503 : /auth\/|token/i.test(message) ? 401 : 400;
    console.error("Big Brothers walk-in receipt issue failed:", message);
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
