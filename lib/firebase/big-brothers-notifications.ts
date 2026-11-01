"use client";

import { getApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

export async function enableVulaPushNotifications(uid: string) {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new Error("Push reminders need the Firebase Cloud Messaging Web Push certificate key in NEXT_PUBLIC_FIREBASE_VAPID_KEY.");
  if (!("Notification" in window)) throw new Error("This browser does not support web notifications.");
  if (!(await isSupported())) throw new Error("Push reminders are not supported in this browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted. You can still see booking updates in the app.");
  const user = auth.currentUser;
  if (!user || user.uid !== uid) throw new Error("Your customer session changed. Reload the app and try again.");
  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(getApp());
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error("Firebase did not issue a notification token. Check your Firebase Messaging setup.");
  const response = await fetch("/api/notifications/register", {
    method: "POST",
    headers: { Authorization: "Bearer " + await getIdToken(user), "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const result = await response.json().catch(() => ({})) as { error?: unknown };
  if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Notification registration was rejected by the server.");
  return true;
}
