import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { bigBrothersAdminApp } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || "";
    const mode = url.searchParams.get("mode") === "mobile" ? "mobile" : "site";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ configured: false, slots: [], message: "Choose a date to check availability." }, { headers: { "Cache-Control": "no-store" } });
    const app = bigBrothersAdminApp();
    const db = getFirestore(app);
    const settingsSnap = await db.doc("businessSettings/main").get();
    const settings = settingsSnap.data() || {};
    const openingTime = String(settings.openingTime || "");
    const closingTime = String(settings.closingTime || "");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openingTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closingTime)) {
      return NextResponse.json({ configured: false, slots: [], message: "Operating hours have not been configured by the team yet." }, { headers: { "Cache-Control": "no-store" } });
    }
    const closedDays = Array.isArray(settings.closedDays) ? settings.closedDays.map((day: unknown) => String(day).toLowerCase()) : [];
    const dayName = new Date(date + "T12:00:00+02:00").toLocaleDateString("en-US", { weekday: "long", timeZone: "Africa/Gaborone" }).toLowerCase();
    if (closedDays.includes(dayName)) return NextResponse.json({ configured: true, slots: [], message: "The wash is marked closed on this day. Choose another date." }, { headers: { "Cache-Control": "no-store" } });

    const capacityKey = mode === "mobile" ? "mobileCapacityPerSlot" : "siteCapacityPerSlot";
    const configuredCapacity = Number(settings[capacityKey] ?? 4);
    const capacity = Number.isFinite(configuredCapacity) && configuredCapacity > 0 ? Math.min(100, Math.floor(configuredCapacity)) : 4;
    const start = new Date(date + "T00:00:00+02:00").toISOString();
    const next = new Date(new Date(date + "T12:00:00+02:00").getTime() + 24 * 60 * 60 * 1000);
    const end = new Date(next.toISOString().slice(0, 10) + "T00:00:00+02:00").toISOString();
    const booked = await db.collection("bookings").where("scheduledFor", ">=", start).where("scheduledFor", "<", end).get();
    const counts = new Map<string, number>();
    for (const doc of booked.docs) {
      const record = doc.data();
      if (record.serviceMode !== mode || record.status !== "confirmed") continue;
      const time = new Date(String(record.scheduledFor || "")).toLocaleTimeString("en-GB", { timeZone: "Africa/Gaborone", hour: "2-digit", minute: "2-digit", hour12: false });
      counts.set(time, (counts.get(time) || 0) + 1);
    }
    const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
    const startMinutes = toMinutes(openingTime);
    const endMinutes = toMinutes(closingTime);
    if (endMinutes <= startMinutes) return NextResponse.json({ configured: false, slots: [], message: "The configured closing time must be later than opening time." }, { status: 400 });
    const slots: string[] = [];
    for (let minute = startMinutes; minute < endMinutes; minute += 30) {
      const time = String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0");
      if ((counts.get(time) || 0) < capacity) slots.push(time);
    }
    return NextResponse.json({ configured: true, capacity, slots, message: slots.length ? "Choose an available preferred time. Staff will still confirm the request." : "No slots are currently available for this day. Choose another date." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Big Brothers availability lookup failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ configured: false, slots: [], message: "Availability could not be checked. Please retry or ask staff." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
