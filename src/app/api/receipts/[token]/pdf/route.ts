import { createReceiptPdf, publicReceipt, readReceiptByToken } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const result = await readReceiptByToken(token);
    if (!result) return new Response("Receipt link is invalid, expired or has been revoked.", { status: 404, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
    const receipt = publicReceipt(result.receipt);
    const pdf = createReceiptPdf(receipt);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="big-brothers-receipt-' + receipt.receiptRef + '.pdf"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Big Brothers PDF receipt failed:", error instanceof Error ? error.message : "unknown error");
    return new Response("Receipt PDF is temporarily unavailable.", { status: 500, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  }
}
