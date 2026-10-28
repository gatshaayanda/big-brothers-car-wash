import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { readReceiptByToken } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const receiptAccess = await readReceiptByToken(token);
    if (!receiptAccess) return NextResponse.json({ error: "This receipt link is invalid, expired or revoked." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    const body = await request.json().catch(() => null) as { rating?: unknown; comment?: unknown; publicConsent?: unknown } | null;
    const rating = body?.rating;
    const comment = typeof body?.comment === "string" ? body.comment.trim() : "";
    const publicConsent = body?.publicConsent === true;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
    if (comment.length > 1000) return NextResponse.json({ error: "Keep your review under 1,000 characters." }, { status: 400 });
    const db = getFirestore(receiptAccess.app);
    const reviewRef = db.doc("reviews/" + receiptAccess.queueEntryId);
    const existing = await reviewRef.get();
    if (existing.exists) return NextResponse.json({ error: "A review has already been submitted for this receipt." }, { status: 409 });
    const receipt = receiptAccess.receipt;
    await reviewRef.create({
      queueEntryId: receiptAccess.queueEntryId,
      receiptRef: String(receipt.receiptRef || ""),
      customerId: String(receipt.customerId || ""),
      customerName: String(receipt.customerName || ""),
      serviceName: String(receipt.serviceName || "Car wash service"),
      rating,
      comment,
      publicConsent,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ submitted: true, message: "Thanks. Your review was sent for the team to check." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Big Brothers review submission failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Your review could not be saved. Please try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
