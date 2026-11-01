import { NextResponse } from "next/server";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import { requireBigBrothersStaff } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { app } = await requireBigBrothersStaff(request);
    const body = await request.json().catch(() => null) as { title?: unknown; message?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (title.length < 3 || title.length > 100) return NextResponse.json({ error: "Announcement title must be 3–100 characters." }, { status: 400 });
    if (message.length < 8 || message.length > 500) return NextResponse.json({ error: "Announcement message must be 8–500 characters." }, { status: 400 });

    const db = getFirestore(app);
    const publishedAt = new Date().toISOString();
    await db.doc("businessSettings/main").set({
      announcementTitle: title,
      announcementMessage: message,
      announcementUpdatedAt: publishedAt,
    }, { merge: true });

    const optedIn = await db.collection("reminderPreferences").where("announcementsEnabled", "==", true).get();
    const tokens: string[] = [];
    for (const preference of optedIn.docs) {
      const tokenDocs = await db.collection("notificationTokens").doc(preference.id).collection("tokens").get();
      for (const tokenDoc of tokenDocs.docs) {
        const token = tokenDoc.data().token;
        if (typeof token === "string" && token.length >= 20) tokens.push(token);
      }
    }

    let sent = 0;
    let failed = 0;
    const messaging = getMessaging(app);
    for (let offset = 0; offset < tokens.length; offset += 500) {
      const chunk = tokens.slice(offset, offset + 500);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body: message },
        data: { url: "/" },
        webpush: { fcmOptions: { link: "/" } },
      });
      sent += result.successCount;
      failed += result.failureCount;
    }
    return NextResponse.json({ published: true, sent, failed, optedInDevices: tokens.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Announcement could not be published.";
    const status = /staff sign-in/i.test(message) ? 401 : /staff access/i.test(message) ? 403 : 500;
    console.error("Big Brothers announcement publish failed:", message);
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
