import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { requireBigBrothersStaff } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

const allowedStatuses = new Set(["requested", "confirmed", "in-progress", "completed", "cancelled"]);

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
        const capacityKey = booking.serviceMode === "mobile" ? "mobileCapacityPerSlot" : "siteCapacityPerSlot";
        const configured = Number(settings[capacityKey] ?? 4);
        const capacity = Number.isFinite(configured) && configured > 0 ? Math.min(100, Math.floor(configured)) : 4;
        const scheduledFor = String(booking.scheduledFor || "");
        if (!scheduledFor) throw new Error("BOOKING_SLOT_MISSING");
        const slotQuery = db.collection("bookings").where("scheduledFor", "==", scheduledFor);
        const slotSnapshot = await transaction.get(slotQuery);
        const confirmedCount = slotSnapshot.docs.filter(doc => doc.id !== bookingId && doc.data().serviceMode === String(booking.serviceMode || "site") && doc.data().status === "confirmed").length;
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
      : message === "BOOKING_SLOT_MISSING" || message.startsWith("BOOKING_CAPACITY_REACHED:") ? 409
      : 400;
    const userMessage = message.startsWith("BOOKING_CAPACITY_REACHED:")
      ? "This time slot is full. The configured capacity is " + message.split(":")[1] + " bookings. Choose another slot or adjust capacity after checking staffing."
      : message === "BOOKING_SLOT_MISSING" ? "This booking has no valid time slot and cannot be confirmed."
      : message === "BOOKING_NOT_FOUND" ? "That booking request could not be found."
      : /staff sign-in|staff access/i.test(message) ? message
      : "Booking status could not be saved. Please retry.";
    return NextResponse.json({ error: userMessage }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
