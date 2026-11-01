import { NextResponse } from "next/server";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const expected = process.env.BIG_BROTHERS_REMINDER_CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected || supplied !== expected) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  try {
    const { runVulaBookingReminders } = await import("@/lib/server/big-brothers-reminder-runner");
    return NextResponse.json({ ok: true, ...(await runVulaBookingReminders()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Vula booking reminder run failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Reminder run failed. Check server configuration and Firebase indexes." }, { status: 500 });
  }
}
