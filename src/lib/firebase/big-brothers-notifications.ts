"use client";

import { getApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export async function enableVulaPushNotifications(uid: string) {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Push reminders need the Firebase Cloud Messaging Web Push certificate key in NEXT_PUBLIC_FIREBASE_VAPID_KEY.");
  if (!("Notification" in window)) throw new Error("This browser does not support web notifications.");
  if (!(await isSupported())) throw new Error("Push reminders are not supported in this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted. You can still see booking updates in the app.");
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(getApp());
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not issue a notification token. Check your Firebase Messaging setup.");
  await setDoc(doc(db, "notificationTokens", uid, "tokens", encodeURIComponent(token)), {
    token, admin: false, updatedAt: new Date().toISOString()
  }, { merge: true });
  return true;
}
