import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { requireBigBrothersStaff } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

const allowedStatuses = new Set(["requested", "confirmed", "in-progress", "completed", "cancelled"]);

function gaboroneParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Gaborone",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

export async function POST(request: Request) {
  try {
    const { app } = await requireBigBrothersStaff(request);
    const body = await request.json().catch(() => null) as { bookingId?: unknown; status?: unknown } | null;
    const bookingId = typeof body?.bookingId === "string" ? body.bookingId.trim() : "";
    const status = typeof body?.status === "string" ? body.status : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(bookingId)) return NextResponse.json({ error: "Choose a valid booking request." }, { status: 400 });
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: "Choose a valid booking status." }, { status: 400 });

    const db = getFirestore(app);
    const bookingRef = db.doc("bookings/" + bookingId);
    const settingsRef = db.doc("businessSettings/main");
    await db.runTransaction(async transaction => {
      const bookingSnap = await transaction.get(bookingRef);
      if (!bookingSnap.exists) throw new Error("BOOKING_NOT_FOUND");
      const booking = bookingSnap.data() || {};
      if (status === "confirmed") {
        const settingsSnap = await transaction.get(settingsRef);
        const settings = settingsSnap.data() || {};
        const serviceMode = String(booking.serviceMode || "");
        if (!["site", "mobile"].includes(serviceMode)) throw new Error("BOOKING_MODE_INVALID");

        const scheduledFor = String(booking.scheduledFor || "");
        const scheduledDate = new Date(scheduledFor);
        if (!scheduledFor || !Number.isFinite(scheduledDate.getTime())) throw new Error("BOOKING_SLOT_MISSING");
        if (scheduledDate.getTime() <= Date.now()) throw new Error("BOOKING_SLOT_PAST");

        const openingTime = String(settings.openingTime || "");
        const closingTime = String(settings.closingTime || "");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openingTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closingTime)) {
          throw new Error("BOOKING_HOURS_UNCONFIGURED");
        }
        const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
        const openingMinutes = toMinutes(openingTime);
        const closingMinutes = toMinutes(closingTime);
        if (closingMinutes <= openingMinutes) throw new Error("BOOKING_HOURS_INVALID");

        const local = gaboroneParts(scheduledDate);
        const localDate = String(local.year) + "-" + String(local.month) + "-" + String(local.day);
        const localTime = String(local.hour) + ":" + String(local.minute);
        const localMinutes = toMinutes(localTime);
        const closedDays = Array.isArray(settings.closedDays)
          ? settings.closedDays.map((day: unknown) => String(day).trim().toLowerCase())
          : [];
        const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Gaborone", weekday: "long" }).format(scheduledDate).toLowerCase();
        if (closedDays.includes(weekday)) throw new Error("BOOKING_DAY_CLOSED");
        if (localMinutes < openingMinutes || localMinutes >= closingMinutes || localMinutes % 30 !== 0 || Number(local.second) !== 0) {
          throw new Error("BOOKING_OUTSIDE_HOURS");
        }

        const capacityKey = serviceMode === "mobile" ? "mobileCapacityPerSlot" : "siteCapacityPerSlot";
        const configured = Number(settings[capacityKey] ?? 4);
        const capacity = Number.isFinite(configured) && configured > 0 ? Math.min(100, Math.floor(configured)) : 4;
        const slotQuery = db.collection("bookings").where("scheduledFor", "==", scheduledFor);
        const slotSnapshot = await transaction.get(slotQuery);
        const confirmedCount = slotSnapshot.docs.filter(doc => doc.id !== bookingId && doc.data().serviceMode === serviceMode && doc.data().status === "confirmed").length;
        if (confirmedCount >= capacity) throw new Error("BOOKING_CAPACITY_REACHED:" + capacity);
      }
      transaction.update(bookingRef, { status, updatedAt: new Date().toISOString() });
    });
    return NextResponse.json({ updated: true, bookingId, status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Booking status could not be saved.";
    const status = /staff sign-in/i.test(message) ? 401
      : /staff access/i.test(message) ? 403
      : message === "BOOKING_NOT_FOUND" ? 404
      : message.startsWith("BOOKING_") ? 409
      : 400;
    const userMessage = message.startsWith("BOOKING_CAPACITY_REACHED:")
      ? "This time slot is full. The configured capacity is " + message.split(":")[1] + " bookings. Choose another slot or adjust capacity after checking staffing."
      : message === "BOOKING_SLOT_MISSING" ? "This booking has no valid time slot and cannot be confirmed."
      : message === "BOOKING_SLOT_PAST" ? "This requested time has already passed. Contact the customer and request a future time."
      : message === "BOOKING_HOURS_UNCONFIGURED" ? "Opening and closing hours are not configured. Set verified business hours before confirming bookings."
      : message === "BOOKING_HOURS_INVALID" ? "The configured closing time must be later than opening time."
      : message === "BOOKING_DAY_CLOSED" ? "Big Brothers is marked closed on that day. Contact the customer to choose another date."
      : message === "BOOKING_OUTSIDE_HOURS" ? "That request is outside the configured 30-minute booking slots and opening hours. Ask the customer to choose an available time."
      : message === "BOOKING_MODE_INVALID" ? "This booking has an invalid service mode and cannot be confirmed."
      : message === "BOOKING_NOT_FOUND" ? "That booking request could not be found."
      : /staff sign-in|staff access/i.test(message) ? message
      : "Booking status could not be saved. Please retry.";
    return NextResponse.json({ error: userMessage }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
