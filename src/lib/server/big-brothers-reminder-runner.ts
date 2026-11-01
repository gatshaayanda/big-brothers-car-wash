import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function adminApp() {
  const existing = getApps().find(app => app.name === "big-brothers-reminders");
  if (existing) return existing;
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) throw new Error("FIREBASE_ADMIN_KEY is missing.");
  const serviceAccount = JSON.parse(raw) as Record<string, unknown>;
  return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: "vulas-car-wash" }, "big-brothers-reminders");
}

export async function runVulaBookingReminders() {
  const app = adminApp();
  const db = getFirestore(app);
  const messaging = getMessaging(app);
  const now = new Date();
  const until = new Date(now.getTime() + 30 * 60 * 1000);
  const snapshot = await db.collection("bookings")
    .where("status", "==", "confirmed")
    .where("scheduledFor", ">=", now.toISOString())
    .where("scheduledFor", "<=", until.toISOString())
    .limit(100)
    .get();
  let sent = 0, skipped = 0, failed = 0;
  for (const booking of snapshot.docs) {
    if (booking.data().reminderSentAt) { skipped++; continue; }
    const uid = String(booking.data().customerId || "");
    if (!uid) { skipped++; continue; }
    const preferences = await db.collection("reminderPreferences").doc(uid).get();
    if (!preferences.exists || preferences.data()?.enabled !== true) { skipped++; continue; }
    const tokensSnapshot = await db.collection("notificationTokens").doc(uid).collection("tokens").where("admin", "==", false).get();
    const tokens = tokensSnapshot.docs.map(item => String(item.data().token || "")).filter(Boolean);
    if (!tokens.length) { skipped++; continue; }
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: "Your Big Brothers Car Wash booking is coming up",
        body: String(booking.data().serviceName || "Your car wash") + " is scheduled within the next 30 minutes."
      },
      data: { link: "/#my-wash", bookingId: booking.id }
    });
    if (result.successCount > 0) {
      await booking.ref.update({ reminderSentAt: new Date().toISOString(), reminderSentCount: result.successCount });
      sent += result.successCount;
    } else {
      failed += result.failureCount;
    }
  }
  return { checked: snapshot.size, sent, skipped, failed };
}
