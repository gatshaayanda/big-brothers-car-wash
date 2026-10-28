import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { bigBrothersAdminApp } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getFirestore(bigBrothersAdminApp()).collection("reviews").where("status", "==", "approved").limit(50).get();
    const reviews = snapshot.docs
      .map(doc => doc.data())
      .filter(review => review.publicConsent === true)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 8)
      .map(review => ({
        id: String(review.receiptRef || ""),
        customer: String(review.customerName || "Customer").trim().split(/\s+/)[0] || "Customer",
        serviceName: String(review.serviceName || "Car wash"),
        rating: Math.max(1, Math.min(5, Number(review.rating || 0))),
        comment: String(review.comment || "").slice(0, 1000),
        createdAt: String(review.createdAt || ""),
      }));
    return NextResponse.json({ reviews }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("Big Brothers public reviews unavailable:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ reviews: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
