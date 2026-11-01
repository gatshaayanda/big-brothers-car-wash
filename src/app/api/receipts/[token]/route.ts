import { NextResponse } from "next/server";
import { publicReceipt, readReceiptByToken } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const result = await readReceiptByToken(token);
    if (!result) return NextResponse.json({ error: "This receipt link is invalid, expired or has been revoked." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ receipt: publicReceipt(result.receipt) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Big Brothers receipt lookup failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "This receipt is temporarily unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
