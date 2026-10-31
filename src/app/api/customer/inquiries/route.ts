import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { bigBrothersAdminApp } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

async function customerFromRequest(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Sign in to your customer account before sending an enquiry.");
  const app = bigBrothersAdminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  return { app, uid: decoded.uid };
}

export async function GET(request: Request) {
  try {
    const { app, uid } = await customerFromRequest(request);
    const snapshot = await getFirestore(app).collection("customerInquiries")
      .where("customerId", "==", uid).limit(30).get();
    const inquiries = snapshot.docs.map(item => {
      const value = item.data();
      return { id: item.id, subject: String(value.subject || "Customer enquiry"), message: String(value.message || ""), status: String(value.status || "open"), createdAt: String(value.createdAt || "") };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ inquiries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Messages could not be loaded.";
    const status = /sign in/i.test(message) ? 401 : /FIREBASE_ADMIN_KEY|credentials|service-account/i.test(message) ? 503 : 401;
    return NextResponse.json({ error: status === 503 ? "Customer messages are temporarily unavailable." : message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const { app, uid } = await customerFromRequest(request);
    const body = await request.json().catch(() => null) as { subject?: unknown; message?: unknown } | null;
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (subject.length < 3 || subject.length > 80) return NextResponse.json({ error: "Choose a topic for your enquiry." }, { status: 400 });
    if (message.length < 5 || message.length > 2000) return NextResponse.json({ error: "Your message must be between 5 and 2,000 characters." }, { status: 400 });
    const db = getFirestore(app);
    const profile = await db.doc("customers/" + uid).get();
    const customer = profile.data() || {};
    const createdAt = new Date().toISOString();
    const record = {
      customerId: uid,
      customerName: String(customer.name || "").slice(0, 120),
      phone: String(customer.phone || "").slice(0, 40),
      subject,
      message,
      status: "open",
      source: "customer-account",
      createdAt,
      updatedAt: createdAt,
    };
    const ref = await db.collection("customerInquiries").add(record);
    return NextResponse.json({ inquiry: { id: ref.id, subject, message, status: "open", createdAt } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Your enquiry could not be sent.";
    const status = /sign in/i.test(message) ? 401 : /FIREBASE_ADMIN_KEY|credentials|service-account/i.test(message) ? 503 : 500;
    console.error("Big Brothers customer enquiry failed:", message);
    return NextResponse.json({ error: status === 503 ? "Your enquiry could not be saved because secure server access is not configured." : message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
