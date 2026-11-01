import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { bigBrothersAdminApp } from "@/lib/server/big-brothers-receipts";
export const runtime = "nodejs";

// Aggregate page-view signal only: no cookies, device fingerprint, or personal data.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null) as { event?: unknown } | null;
    if (body?.event !== "home_view") return NextResponse.json({ recorded: false }, { status: 400 });
    const app = bigBrothersAdminApp();
    await getFirestore(app).collection("publicSiteEvents").add({
      event: "home_view",
      page: "/",
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ recorded: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
