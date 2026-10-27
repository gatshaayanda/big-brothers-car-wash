"use client";

import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

export type VulaService = { id: string; name: string; description?: string; category?: string; price?: number; active: boolean; updatedAt?: string };
export type VulaBooking = { id: string; customerId: string; customerName: string; phone: string; vehicleType: string; vehicleRegistration: string; serviceId: string; serviceName: string; serviceMode: "site" | "mobile"; locationId: string; address: string; scheduledFor: string; notes: string; priceQuote?: number; paymentMethod?: string; paymentStatus?: string; status: string; createdAt: string; updatedAt: string };
export type VulaQueueEntry = { id: string; customerId: string; customerName: string; phone: string; vehicleType: string; vehicleRegistration: string; serviceId: string; serviceName: string; locationId: string; notes: string; status: string; createdAt: string; updatedAt: string };
export type VulaFleetRequest = { id: string; customerId: string; businessName: string; contactName: string; phone: string; email: string; vehicleCount: number; vehicleTypes: string[]; serviceNeeds: string[]; preferredLocation: string; preferredSchedule: string; notes: string; status: string; createdAt: string; updatedAt: string };
export type VulaGalleryItem = { id: string; title: string; imageUrl: string; description?: string; active: boolean; createdAt?: string };

function subscribeList<T>(path: string, cb: (items: T[]) => void, fail: (error: Error) => void, activeOnly = false): Unsubscribe {
  const source = collection(db, path);
  return onSnapshot(activeOnly ? query(source, where("active", "==", true)) : source, { includeMetadataChanges: true }, snapshot => {
    cb(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as T));
  }, fail);
}
export const subscribeServices = (cb: (items: VulaService[]) => void, fail: (e: Error) => void) => subscribeList<VulaService>("services", cb, fail, true);
export const subscribeGallery = (cb: (items: VulaGalleryItem[]) => void, fail: (e: Error) => void) => subscribeList<VulaGalleryItem>("gallery", cb, fail, true);
export const subscribeBookings = (cb: (items: VulaBooking[]) => void, fail: (e: Error) => void) => subscribeList<VulaBooking>("bookings", cb, fail);
export const subscribeQueue = (cb: (items: VulaQueueEntry[]) => void, fail: (e: Error) => void) => subscribeList<VulaQueueEntry>("queueEntries", cb, fail);
export const subscribeFleet = (cb: (items: VulaFleetRequest[]) => void, fail: (e: Error) => void) => subscribeList<VulaFleetRequest>("fleetRequests", cb, fail);
export function subscribeCustomerBookings(uid: string, cb: (items: VulaBooking[]) => void, fail: (e: Error) => void): Unsubscribe {
  return onSnapshot(query(collection(db, "bookings"), where("customerId", "==", uid)), { includeMetadataChanges: true }, snap => {
    cb(snap.docs.map(item => ({ id: item.id, ...item.data() }) as VulaBooking).sort((a,b) => b.createdAt.localeCompare(a.createdAt)));
  }, fail);
}
export function subscribeLoyaltyAccount(uid: string, cb: (value: Record<string, unknown> | null) => void, fail: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, "loyaltyAccounts", uid), snap => cb(snap.exists() ? snap.data() : null), fail);
}
export function subscribeReminderPreferences(uid: string, cb: (value: Record<string, unknown> | null) => void, fail: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, "reminderPreferences", uid), snap => cb(snap.exists() ? snap.data() : null), fail);
}
export async function saveReminderPreferences(uid: string, enabled: boolean) {
  await setDoc(doc(db, "reminderPreferences", uid), { enabled, channels: ["in-app"], updatedAt: new Date().toISOString() }, { merge: true });
}
export async function saveLoyaltyBalance(uid: string, pointsBalance: number, note: string) {
  await setDoc(doc(db, "loyaltyAccounts", uid), { uid, pointsBalance: Math.max(0, Math.floor(pointsBalance)), note, updatedAt: new Date().toISOString() }, { merge: true });
}
export function subscribeSettings(cb: (settings: Record<string, unknown> | null) => void, fail: (e: Error) => void): Unsubscribe {
  return onSnapshot(doc(db, "businessSettings", "main"), snap => cb(snap.exists() ? snap.data() : null), fail);
}
export async function saveService(data: { id?: string; name: string; description: string; category: string; price?: number; active: boolean }) {
  const ref = data.id ? doc(db, "services", data.id) : doc(collection(db, "services"));
  await setDoc(ref, { ...data, id: ref.id, updatedAt: new Date().toISOString() }, { merge: true });
}
export async function saveGalleryItem(data: { id?: string; title: string; imageUrl: string; description: string; active: boolean }) {
  const ref = data.id ? doc(db, "gallery", data.id) : doc(collection(db, "gallery"));
  await setDoc(ref, { ...data, id: ref.id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
}
export async function saveSettings(data: Record<string, unknown>) {
  await setDoc(doc(db, "businessSettings", "main"), { ...data, updatedAt: new Date().toISOString() }, { merge: true });
}
export async function updateOperationalRecord(path: "bookings" | "queueEntries" | "fleetRequests", id: string, patch: Record<string, unknown>) {
  await updateDoc(doc(db, path, id), { ...patch, updatedAt: new Date().toISOString() });
}
export async function setBookingStatus(id: string, status: string) {
  await updateOperationalRecord("bookings", id, { status });
}
