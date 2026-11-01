/* eslint-disable react/no-unescaped-entities, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getIdToken, signInAnonymously, signOut } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, hasFirebaseWebConfig } from "@/lib/firebase/client";
import { subscribeServices, subscribeSettings, type VulaService } from "@/lib/firebase/big-brothers-data";
import "./big-brothers.css";
import LocationWeather from "@/components/LocationWeather";
import BookingDateWeather from "@/components/BookingDateWeather";
import RacingWarmup from "@/app/games/racing-warmup";

type Notice = { kind: "success" | "error" | "pending"; text: string };
const pendingKey = "big-brothers-car-wash:offline-requests:v1";
const stamp = () => new Date().toISOString();
function gaboroneDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Gaborone", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
function addDateKeyDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return date.toISOString().slice(0, 10);
}
function bookingDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
}
function bookingDayName(value: string) {
  return new Date(value + "T12:00:00+02:00").toLocaleDateString("en-US", { weekday: "long", timeZone: "Africa/Gaborone" }).toLowerCase();
}

const money = (price?: number) => typeof price === "number" ? "P" + price.toLocaleString("en-BW", { maximumFractionDigits: 2 }) : "Price confirmed by the team";
function formatBotswanaPhoneInput(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00267")) digits = digits.slice(5); else if (digits.startsWith("267")) digits = digits.slice(3);
  if (digits.startsWith("0") && digits.length === 9) digits = digits.slice(1);
  digits = digits.slice(0, 8);
  return "+267 " + digits.slice(0, 2) + (digits.length > 2 ? " " + digits.slice(2, 5) : "") + (digits.length > 5 ? " " + digits.slice(5, 8) : "");
}
function isValidBotswanaPhone(value: string) { const digits = value.replace(/\D/g, ""); return digits.length === 11 && digits.startsWith("267"); }
function botswanaPhoneDigits(value: string) { let digits = value.replace(/\D/g, ""); if (digits.startsWith("00267")) digits = digits.slice(5); else if (digits.startsWith("267")) digits = digits.slice(3); if (digits.startsWith("0") && digits.length === 9) digits = digits.slice(1); return digits.slice(0, 8); }
function normalizeWhatsAppDigits(value: string) {
  const trimmed = value.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (!trimmed.startsWith("+") && !digits.startsWith("267")) {
    if (digits.startsWith("0")) digits = "267" + digits.slice(1);
    else if (digits.length === 8) digits = "267" + digits;
  }
  return digits;
}
function storeOfflineDraft(draft: { id: string; collection: string; data: Record<string, unknown>; enteredBy?: "customer" | "staff" }) {
  const raw = localStorage.getItem(pendingKey) || "[]";
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("The saved offline request list is damaged. Keep this screen open and reconnect before retrying.");
  const drafts = parsed as Array<{ id?: string }>;
  if (!drafts.some(item => item.id === draft.id) && drafts.length >= 25) {
    throw new Error("This device already has 25 pending requests. Reconnect and sync them before saving another walk-in.");
  }
  if (!drafts.some(item => item.id === draft.id)) drafts.push(draft);
  localStorage.setItem(pendingKey, JSON.stringify(drafts));
}

function buildWhatsAppSelfLink(phone: string, appUrl: string) {
  const digits = normalizeWhatsAppDigits(phone);
  const message = "Thanks for choosing Big Brothers Car Wash!\n\nWe appreciate you trusting us with your ride.\n\nYour Big Brothers account makes every visit easier. Keep your wash receipts and vehicle details together, check your wash history and book your next visit without starting from scratch.\n\nPlanning a regular wash routine? Your account makes it easier to come back and keep your ride looking its best.\n\nAccess your car wash account here:\n" + appUrl + "\n\nBig Brothers Car Wash\nWash. Care. Go.";
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(message);
}

export default function Home() {
  const [services, setServices] = useState<VulaService[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [heroMediaUnavailable, setHeroMediaUnavailable] = useState(false);
  const [homeDestination, setHomeDestination] = useState<"home" | "queue" | "racing">("home");
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueHandoff, setQueueHandoff] = useState<"synced" | "offline" | null>(null);
  const [queueReference, setQueueReference] = useState("");
  const [queueReceiptUrl, setQueueReceiptUrl] = useState("");
  const [queueReceiptError, setQueueReceiptError] = useState("");
  const [queueWhatsAppPhone, setQueueWhatsAppPhone] = useState("");
  const [queueCustomerName, setQueueCustomerName] = useState("");
  const [queueEnteredBy, setQueueEnteredBy] = useState<"customer" | "staff">("customer");
  const [queueEntryMode, setQueueEntryMode] = useState<"customer" | "staff">("customer");
  const [tipChoice, setTipChoice] = useState("0");
  const [customTipAmount, setCustomTipAmount] = useState("");
  const [staffAgreedWashPrice, setStaffAgreedWashPrice] = useState("");
  const [queueAppUrl, setQueueAppUrl] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [handoffMessage, setHandoffMessage] = useState("");
  const [mode, setMode] = useState<"site" | "mobile">("site");
  const [serviceId, setServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingMonth, setBookingMonth] = useState(() => addDateKeyDays(gaboroneDateKey(), 1).slice(0, 7));
  const [bookingServiceId, setBookingServiceId] = useState("");
  const [bookingTipChoice, setBookingTipChoice] = useState("0");
  const [bookingCustomTipAmount, setBookingCustomTipAmount] = useState("");
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [bookingTime, setBookingTime] = useState("");
  const bookingTimeRef = useRef(bookingTime);
  useEffect(() => { bookingTimeRef.current = bookingTime; }, [bookingTime]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [availabilityConfigured, setAvailabilityConfigured] = useState<boolean | null>(null);
  const [availabilityMessage, setAvailabilityMessage] = useState("");
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [tab, setTab] = useState<"book" | "queue" | "fleet">("queue");
  const [repeatPrefill, setRepeatPrefill] = useState<{customerName?:string;phone?:string;vehicleType?:string;vehicleRegistration?:string}|null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [customerNameInput, setCustomerNameInput] = useState("");
  const [broughtByNameInput, setBroughtByNameInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [helpTeaserDismissed, setHelpTeaserDismissed] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const offlineSyncInProgress = useRef(false);
  const mobileCoverage = Array.isArray(settings.mobileCoverage) ? settings.mobileCoverage as string[] : [];
  const configuredBusinessName = typeof settings.businessName === "string" ? settings.businessName.trim() : "";
  const businessName = configuredBusinessName && !/car\s+a\s+wash|😎/i.test(configuredBusinessName) ? configuredBusinessName : "Big Brothers Car Wash";
  const locationName = typeof settings.locationName === "string" && settings.locationName.trim() ? settings.locationName : "G-West";
  const activeServices = useMemo(() => services.filter(s => s.active), [services]);
  const selectedQueueService = activeServices.find(service => service.id === serviceId);
  const customerTipValue = tipChoice === "custom" ? Number(customTipAmount || 0) : Number(tipChoice);
  const bookingCalendarDays = useMemo(() => {
    const [year, month] = bookingMonth.split("-").map(Number);
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return Array.from({ length: count }, (_, index) => ({ day: index + 1, key: year + "-" + String(month).padStart(2, "0") + "-" + String(index + 1).padStart(2, "0") }));
  }, [bookingMonth]);
  const bookingMonthLabel = useMemo(() => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(bookingMonth + "-01T12:00:00Z")), [bookingMonth]);
  const selectedBookingService = activeServices.find(service => service.id === bookingServiceId);
  const bookingTipValue = bookingTipChoice === "custom" ? Number(bookingCustomTipAmount || 0) : Number(bookingTipChoice);
  const minimumBookingDate = addDateKeyDays(gaboroneDateKey(), 1);
  const shiftBookingMonth = (offset: number) => {
    const [year, month] = bookingMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1));
    setBookingMonth(next.toISOString().slice(0, 7));
  };

  useEffect(() => {
    try { const raw = sessionStorage.getItem("big-brothers-repeat-wash"); if (raw) { const draft = JSON.parse(raw) as {customerName?:string;phone?:string;vehicleType?:string;vehicleRegistration?:string}; sessionStorage.removeItem("big-brothers-repeat-wash"); setRepeatPrefill(draft); setTab("book"); } } catch {}
  }, []);

  useEffect(() => {
    if (tab !== "book" || !repeatPrefill) return;
    const form = document.querySelector<HTMLFormElement>(".big-brothers-form");
    if (!form) return;
    for (const [name, value] of Object.entries({customerName:repeatPrefill.customerName,phone:repeatPrefill.phone,vehicleType:repeatPrefill.vehicleType,vehicleRegistration:repeatPrefill.vehicleRegistration})) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement && typeof value === "string" && value) field.value = value;
    }
    setNotice({kind:"pending",text:"Your saved details are filled in. Check the vehicle and service, then send your new booking request."});
    if (repeatPrefill.phone) setPhoneInput(formatBotswanaPhoneInput(repeatPrefill.phone));
    setRepeatPrefill(null);
  }, [tab, repeatPrefill]);

  useEffect(() => {
    const footer = document.querySelector(".big-brothers-footer");
    if (!footer || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      setFooterVisible(entries.some(entry => entry.isIntersecting));
    }, { threshold: 0.01 });
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    if ("storage" in navigator && navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    const onOnline = () => { setOnline(true); void syncOfflineRequests(); };
    const onOffline = () => { setOnline(false); setNotice({ kind: "pending", text: "Offline: requests can be saved on this device, but the team cannot see them until they sync." }); };
    const onResume = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void syncOfflineRequests();
    };
    const stops = [subscribeServices(setServices, error => setConnectionError(error.message)), subscribeSettings(value => setSettings(value ?? {}), () => {})];
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    window.addEventListener("pageshow", onResume); document.addEventListener("visibilitychange", onResume);
    if (navigator.onLine) void syncOfflineRequests();
    return () => {
      stops.forEach(stop => stop());
      window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline);
      window.removeEventListener("pageshow", onResume); document.removeEventListener("visibilitychange", onResume);
    };
  }, []);

  useEffect(() => { const params = new URLSearchParams(window.location.search); if (params.get("journey") === "book") { setHomeDestination("queue"); setTab("book"); setBookingDate(params.get("preferredDate") || ""); if(params.get("preferredDate")) setBookingMonth(params.get("preferredDate")!.slice(0, 7)); setBookingTime(params.get("preferredTime") || ""); setMode(params.get("mode") === "mobile" ? "mobile" : "site"); window.setTimeout(() => document.getElementById("request")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); } }, []);
  useEffect(() => {
    if (tab !== "book" || !bookingDate) { setAvailableSlots([]); setAvailabilityConfigured(null); setAvailabilityMessage(""); return; }
    if (!online) { setAvailableSlots([]); setAvailabilityConfigured(null); setAvailabilityMessage("Offline: live availability cannot be checked. Any saved request remains unconfirmed until staff review."); return; }
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityConfigured(null);
    setAvailabilityMessage("Checking available times…");
    fetch("/api/bookings/availability?date=" + encodeURIComponent(bookingDate) + "&mode=" + (mode === "mobile" ? "mobile" : "site"), { cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { configured?: boolean; slots?: string[]; message?: string };
        if (!response.ok) throw new Error(data.message || "Availability could not be checked.");
        if (cancelled) return;
        const slots = Array.isArray(data.slots) ? data.slots : [];
        setAvailableSlots(slots);
        setAvailabilityConfigured(Boolean(data.configured));
        setAvailabilityMessage(String(data.message || ""));
        if (bookingTimeRef.current && !slots.includes(bookingTimeRef.current) && data.configured) setBookingTime("");
      })
      .catch(error => { if (!cancelled) { setAvailableSlots([]); setAvailabilityConfigured(false); setAvailabilityMessage(error instanceof Error ? error.message : "Availability could not be checked."); } })
      .finally(() => { if (!cancelled) setAvailabilityLoading(false); });
    return () => { cancelled = true; };
  }, [tab, bookingDate, mode, online]);


  async function saveCustomerRecord(uid: string, name: string, phone: string, email: string) {
    const customerRef = doc(db, "customers", uid);
    const existing = await getDoc(customerRef);
    const previous = existing.exists() ? existing.data() : {};
    await setDoc(customerRef, {
      uid,
      name: name.trim() || String(previous.name || ""),
      email: email.trim() || String(previous.email || ""),
      phone: phone.trim() || String(previous.phone || ""),
      vehicleRegistrations: Array.isArray(previous.vehicleRegistrations) ? previous.vehicleRegistrations : [],
      createdAt: typeof previous.createdAt === "string" ? previous.createdAt : stamp(),
      updatedAt: stamp(),
    }, { merge: true });
  }

  async function ensureUser() {
    if (auth.currentUser) return auth.currentUser;
    if (!navigator.onLine || !hasFirebaseWebConfig) return null;
    return (await signInAnonymously(auth)).user;
  }
  async function syncOfflineRequests() {
    if (!navigator.onLine || !hasFirebaseWebConfig) return;
    let drafts: Array<{ id?: string; collection: string; data: Record<string, unknown>; enteredBy?: "customer" | "staff" }> = [];
    try { drafts = JSON.parse(localStorage.getItem(pendingKey) || "[]") as typeof drafts; } catch {}
    if (!drafts.length || offlineSyncInProgress.current) return;
    offlineSyncInProgress.current = true;
    try {
      const user = await ensureUser(); if (!user) return;
      const remaining: typeof drafts = [];
      let syncedQueue: (typeof drafts)[number] | undefined;
      let syncedReceiptUrl = "";
      for (const draft of drafts) {
        try {
          const id = draft.id || crypto.randomUUID();
          await saveCustomerRecord(user.uid, String(draft.data.customerName || draft.data.contactName || ""), String(draft.data.phone || ""), String(draft.data.email || user.email || ""));
          await setDoc(doc(db, draft.collection, id), { ...draft.data, customerId: user.uid, updatedAt: stamp() });
          if (draft.collection === "queueEntries") {
            const response = await fetch("/api/receipts/issue", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await getIdToken(user) }, body: JSON.stringify({ queueEntryId: id }) });
            const result = await response.json().catch(() => ({})) as { issued?: boolean; url?: string; error?: string };
            if (!response.ok || !result.issued || !result.url) throw new Error(result.error || "Walk-in saved, but its receipt is still waiting to sync.");
            syncedQueue = draft;
            syncedReceiptUrl = result.url;
          }
        } catch { remaining.push(draft); }
      }
      localStorage.setItem(pendingKey, JSON.stringify(remaining));
      setNotice(remaining.length ? { kind: "pending", text: remaining.length + " saved request(s) still have not synced." } : { kind: "success", text: "Saved requests have synced to Big Brothers' system. Bookings still need staff confirmation." });
      if (syncedQueue) { setQueueReference(syncedQueue.id || ""); setQueueCustomerName(String(syncedQueue.data.customerName || "")); setQueueWhatsAppPhone(String(syncedQueue.data.phone || "")); setQueueEnteredBy(syncedQueue.enteredBy === "staff" ? "staff" : "customer"); setQueueAppUrl(window.location.origin + "/account"); setQueueReceiptUrl(syncedReceiptUrl); setQueueReceiptError(""); setQueueHandoff("synced"); }
    } catch { setNotice({ kind: "pending", text: "Sync is not complete. Your saved requests remain on this device." }); }
    finally { offlineSyncInProgress.current = false; }
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const broughtByName = String(form.get("broughtByName") ?? "").trim();
    const enteredBy = String(form.get("enteredBy") ?? "customer") === "staff" ? "staff" : "customer";
    const vehicleType = String(form.get("vehicleType") ?? "").trim();
    const vehicleDescription = String(form.get("vehicleType") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const customerOfferRaw = String(form.get("customerOfferAmount") ?? "").trim();
    const customerOfferAmount = customerOfferRaw ? Number(customerOfferRaw) : null;
    const customTipRaw = String(form.get("customTipAmount") ?? "").trim();
    const tipAmount = tab === "book" ? bookingTipValue : enteredBy === "customer" ? (tipChoice === "custom" ? Number(customTipRaw) : Number(form.get("tipAmount") ?? 0)) : 0;
    const agreedWashPriceRaw = String(form.get("staffAgreedWashPrice") ?? "").trim();
    const agreedWashPrice = agreedWashPriceRaw ? Number(agreedWashPriceRaw) : null;
    const now = stamp();
    if (!customerName || !phone) { setNotice({ kind: "error", text: "Enter the customer’s name and WhatsApp number." }); return; }
    if (!isValidBotswanaPhone(phone)) { setNotice({ kind: "error", text: "Enter all 8 digits of the Botswana number after +267. Example: +267 71 234 567." }); return; }
    if (tab === "book" && !broughtByName) { setNotice({ kind: "error", text: "Enter the name of the person bringing the car." }); return; }
    if (tab === "queue" && !serviceId) { setNotice({ kind: "error", text: "Choose a listed wash service or select “I’d like to propose my own price” to enter an amount for the attendant to consider." }); return; }
    if ((tab === "queue" && enteredBy === "customer" || tab === "book") && (!Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 1000000)) { setNotice({ kind: "error", text: "Enter a valid optional Zaka amount, or choose No tip." }); return; }
    if (tab === "book" && bookingTipChoice === "custom" && (!bookingCustomTipAmount.trim() || !Number.isFinite(tipAmount) || tipAmount <= 0)) { setNotice({ kind: "error", text: "Enter a custom Zaka amount greater than P0, or choose No tip." }); return; }
    if (tab === "queue" && enteredBy === "customer" && tipChoice === "custom" && (!customTipRaw || !Number.isFinite(tipAmount) || tipAmount <= 0)) { setNotice({ kind: "error", text: "Enter a custom tip greater than P0, or choose No tip." }); return; }
    if (tab === "queue" && enteredBy === "staff" && serviceId === "customer-offer" && (agreedWashPrice === null || !Number.isFinite(agreedWashPrice) || agreedWashPrice <= 0 || agreedWashPrice > 1000000)) { setNotice({ kind: "error", text: "Enter the wash price agreed face-to-face with the customer." }); return; }
    setBusy(true); setNotice(null);
    let submissionStage: "authentication" | "customer profile" | "queue entry" | "booking request" | "fleet enquiry" = "authentication";
    let pendingQueueId = "";
    let pendingQueueData: Record<string, unknown> | null = null;
    try {
      const common: Record<string, unknown> = { customerName, phone, ...(broughtByName ? { broughtByName } : {}), vehicleType: vehicleDescription || "Not described", vehicleRegistration: "", notes, createdAt: now, updatedAt: now };
      let collectionName: string; let data: Record<string, unknown>;
      if (tab === "book") {
        const address = String(form.get("address") ?? "").trim(); const scheduledInput = String(form.get("scheduledFor") ?? "");
        if (mode === "mobile" && !address) throw new Error("Enter the area or address for the mobile coverage check.");
        if (!scheduledInput) throw new Error("Choose your preferred date and time.");
        if (bookingDate < minimumBookingDate) throw new Error("Future wash requests must be at least one day ahead.");
        if (settings.closedDays && Array.isArray(settings.closedDays) && settings.closedDays.map(day => String(day).toLowerCase()).includes(bookingDayName(bookingDate))) throw new Error("That day is marked closed by Big Brothers. Choose another date.");
        if (availabilityConfigured === true && !availableSlots.includes(bookingTime)) throw new Error("That preferred time is no longer available. Choose another time.");
        const scheduledDate = new Date(scheduledInput);
        if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) throw new Error("Choose a future date and time.");
        const closedDays = Array.isArray(settings.closedDays) ? settings.closedDays.map(day => String(day).toLowerCase()) : [];
        const dayName = scheduledDate.toLocaleDateString("en-US", { weekday: "long", timeZone: "Africa/Gaborone" }).toLowerCase();
        if (closedDays.includes(dayName)) throw new Error("That day is marked closed by Big Brothers. Choose another date.");
        const scheduledFor = scheduledDate.toISOString();
        collectionName = "bookings";
        data = { ...common, serviceId: bookingServiceId || "general-request", serviceName: activeServices.find(s => s.id === bookingServiceId)?.name || "General car wash request", serviceMode: mode, locationId: mode === "site" ? locationName : "coverage-review", address, scheduledFor, paymentMethod: String(form.get("paymentMethod") || "pay-on-site"), paymentStatus: "unpaid", ...(tipAmount > 0 ? { tipAmount } : {}), status: "requested" };
      } else if (tab === "queue") {
        collectionName = "queueEntries";
        const selectedOffer = activeServices.find(s => s.id === serviceId && typeof s.price === "number" && s.price >= 0);
        if (serviceId !== "customer-offer" && !selectedOffer) throw new Error("Choose one of the currently priced wash offers.");
        if (serviceId === "customer-offer" && enteredBy === "customer" && (customerOfferAmount === null || !Number.isFinite(customerOfferAmount) || customerOfferAmount <= 0 || customerOfferAmount > 1000000)) throw new Error("Enter a proposed amount greater than BWP 0 for the attendant to consider.");
        data = { ...common, email: String(form.get("email") ?? "").trim(), serviceId, serviceName: serviceId === "customer-offer" ? (enteredBy === "staff" ? "Staff-agreed custom wash price" : "Customer-proposed price (agree with attendant)") : selectedOffer!.name, ...(selectedOffer ? { servicePrice: selectedOffer.price } : {}), ...(customerOfferAmount !== null && Number.isFinite(customerOfferAmount) && customerOfferAmount > 0 && enteredBy === "customer" ? { customerOfferAmount } : {}), enteredBy, tipAmount, washPriceStatus: serviceId !== "customer-offer" ? "listed-service" : enteredBy === "staff" ? "agreed-face-to-face" : "pending-agreement", ...(enteredBy === "staff" && serviceId === "customer-offer" && agreedWashPrice !== null ? { agreedWashPrice } : {}), locationId: locationName, status: "waiting" };
      } else {
        collectionName = "fleetRequests";
        data = { businessName: String(form.get("businessName") ?? "").trim(), contactName: customerName, phone, email: String(form.get("email") ?? "").trim(), vehicleCount: Number(form.get("vehicleCount") || 1), vehicleTypes: [vehicleType], serviceNeeds: [String(form.get("fleetNeeds") || "Regular cleaning")], preferredLocation: String(form.get("preferredLocation") || locationName), preferredSchedule: String(form.get("preferredSchedule") ?? ""), notes, status: "new", createdAt: now, updatedAt: now };
        if (!data.businessName) throw new Error("Enter the business or fleet name.");
      }
      if (!navigator.onLine || !hasFirebaseWebConfig) {
        const localId = crypto.randomUUID();
        storeOfflineDraft({ id: localId, collection: collectionName, data, ...(tab === "queue" ? { enteredBy } : {}) });
        formElement.reset();
        if (tab === "queue") { setQueueReference(localId); setQueueCustomerName(customerName); setQueueWhatsAppPhone(phone); setQueueEnteredBy(enteredBy); setQueueAppUrl(window.location.origin + "/account"); setQueueHandoff("offline"); }
        setNotice({ kind: "pending", text: "Saved on this device only. It is not visible to the team or a confirmed booking until it syncs." }); return;
      }
      const requestRef = doc(collection(db, collectionName));
      if (tab === "queue") { pendingQueueId = requestRef.id; pendingQueueData = data; }
      const user = await ensureUser();
      if (!user) throw new Error("Online service is not configured yet. Your request has not been sent.");
      submissionStage = "customer profile";
      await saveCustomerRecord(user.uid, customerName, phone, String(form.get("email") || user.email || ""));
      submissionStage = tab === "queue" ? "queue entry" : tab === "book" ? "booking request" : "fleet enquiry";
      setNotice({ kind: "pending", text: "Sending securely to Big Brothers' system…" });
      await setDoc(requestRef, { ...data, customerId: user.uid });
      let issuedReceiptUrl = "";
      if (tab === "queue") {
        const response = await fetch("/api/receipts/issue", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await getIdToken(user) }, body: JSON.stringify({ queueEntryId: requestRef.id }) });
        const result = await response.json().catch(() => ({})) as { issued?: boolean; url?: string; error?: string };
        if (response.ok && result.issued && result.url) { issuedReceiptUrl = result.url; setQueueReceiptError(""); }
        else setQueueReceiptError(result.error || "Your walk-in is saved, but the receipt could not be issued yet. Keep this reference and retry when connected.");
      }
      formElement.reset();
      if (tab === "queue") { setQueueReference(requestRef.id); setQueueCustomerName(customerName); setQueueWhatsAppPhone(phone); setQueueEnteredBy(enteredBy); setQueueAppUrl(window.location.origin + "/account"); setQueueReceiptUrl(issuedReceiptUrl); setQueueHandoff("synced"); }
      setNotice({ kind: "success", text: tab === "queue" ? (issuedReceiptUrl ? "Your walk-in and branded receipt are saved." : "Your walk-in is saved in the shared queue. Your receipt is still being prepared; use Retry receipt below.") : "Your booking request reached Big Brothers. The team will check availability and confirm it with you." });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code || "") : "";
      const networkFailure = !navigator.onLine || ["unavailable", "network-request-failed", "auth/network-request-failed", "auth/timeout", "deadline-exceeded"].includes(code);
      if (tab === "queue" && pendingQueueId && pendingQueueData && networkFailure) {
        try {
          storeOfflineDraft({ id: pendingQueueId, collection: "queueEntries", data: pendingQueueData, enteredBy });
          formElement.reset();
          setQueueReference(pendingQueueId);
          setQueueCustomerName(customerName);
          setQueueWhatsAppPhone(phone);
          setQueueEnteredBy(enteredBy);
          setQueueAppUrl(window.location.origin + "/account");
          setQueueReceiptUrl("");
          setQueueReceiptError("Saved on this device. The secure receipt will be issued after the server confirms sync.");
          setQueueHandoff("offline");
          setNotice({ kind: "pending", text: "Connection interrupted. Your walk-in is saved on this device with a stable reference and will retry when connected." });
          return;
        } catch (storageError) {
          const storageMessage = storageError instanceof Error ? storageError.message : "Device storage is unavailable.";
          setNotice({ kind: "error", text: "The request could not reach the server and this device could not safely save an offline draft: " + storageMessage });
          return;
        }
      }
      const detail = error instanceof Error ? error.message : "Unknown Firebase error.";
      const permissionDenied = code === "permission-denied";
      const stageMessage = permissionDenied
        ? `Firebase denied the ${submissionStage} step. No queue entry was confirmed. Check that the published rules match the Big Brothers app and that this app is connected to the intended Vula Firebase project.`
        : `The ${submissionStage} step failed: ${detail}`;
      setNotice({ kind: "error", text: stageMessage });
    } finally { setBusy(false); }
  }

  async function retryQueueReceipt() {
    const user = auth.currentUser;
    if (!user || !navigator.onLine || !queueReference) {
      setQueueReceiptError("Reconnect to the internet to prepare this receipt. Your saved walk-in reference is " + queueReference + ".");
      return;
    }
    try {
      const response = await fetch("/api/receipts/issue", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await getIdToken(user) }, body: JSON.stringify({ queueEntryId: queueReference }) });
      const result = await response.json().catch(() => ({})) as { issued?: boolean; url?: string; error?: string };
      if (!response.ok || !result.issued || !result.url) throw new Error(result.error || "Receipt could not be issued.");
      setQueueReceiptUrl(result.url);
      setQueueReceiptError("");
    } catch (error) {
      setQueueReceiptError(error instanceof Error ? error.message : "Receipt could not be issued. Try again when connected.");
    }
  }

  async function finishQueueHandoff() {
    setHandoffError("");
    try {
      await signOut(auth);
      setQueueHandoff(null);
      setQueueReference("");
      setQueueReceiptUrl("");
      setQueueReceiptError("");
      setQueueCustomerName("");
      setQueueWhatsAppPhone("");
      setQueueEnteredBy("customer");
      setQueueEntryMode("customer");
      setTipChoice("0");
      setCustomTipAmount("");
      setStaffAgreedWashPrice("");
      setQueueAppUrl("");
      setHandoffMessage("");
      setNotice(null);
      setCustomerNameInput("");
      setServiceId("");
      setTab("queue");
    } catch {
      setHandoffError("This session could not be cleared. Keep this screen open and try again before handing the phone to another customer.");
    }
  }

  async function copyQueueAppLink() {
    setHandoffError("");
    try { await navigator.clipboard.writeText(queueAppUrl); setHandoffMessage("App link copied. Open WhatsApp and send it to the number you entered."); }
    catch { setHandoffError("Automatic copying is unavailable. Copy the app address shown below and paste it into WhatsApp."); }
  }

  function discardOfflineQueueDraft() {
    try {
      const drafts = JSON.parse(localStorage.getItem(pendingKey) || "[]") as Array<{id?: string}>;
      localStorage.setItem(pendingKey, JSON.stringify(drafts.filter(draft => draft.id !== queueReference)));
      void finishQueueHandoff();
    } catch {
      setHandoffError("The saved draft could not be removed. Do not hand this phone to another customer until the session is cleared.");
    }
  }

  useEffect(() => {
    if (queueHandoff) window.scrollTo(0, 0);
  }, [queueHandoff]);

  if (queueHandoff) {
    return <main className="vula queue-handoff-page"><section className="queue-handoff-card" aria-labelledby="queue-handoff-title">
      <span className="big-brothers-eyebrow">BIG BROTHERS CAR WASH · WALK-IN</span>
      <h1 id="queue-handoff-title">{queueHandoff === "synced" ? "You're in the queue." : "Your request is saved here."}</h1>
      {queueHandoff === "synced" ? <><div className="queue-customer-confirm"><span aria-hidden="true">✅</span><div><strong>{queueCustomerName || "Customer"}, your place is saved.</strong><p>Your details are now in the shared Big Brothers staff queue.</p></div></div><a className="big-brothers-button primary whatsapp-self-send queue-whatsapp-primary" href={buildWhatsAppSelfLink(queueWhatsAppPhone, queueAppUrl)} target="_blank" rel="noreferrer">📲 Send the Big Brothers link to {queueCustomerName || "your"}’s WhatsApp ↗</a><p className="field-hint queue-trust-copy">One quick step: tap the button to open WhatsApp, check that the number is yours, then press <strong>Send</strong>. Open the account link on your own phone to access your Big Brothers car wash account. Nothing is sent until you press Send.</p><p className="queue-reference">Official app address <strong>{queueAppUrl.replace("https://", "").replace("http://", "")}</strong> <span>· Opens Big Brothers Car Wash</span></p><p className="queue-reference">Sent by: <strong>{queueEnteredBy === "staff" ? "Big Brothers staff assisting" : "Customer"}</strong></p><button type="button" className="big-brothers-button secondary" onClick={() => void copyQueueAppLink()}>Copy app link</button>{handoffMessage && <p role="status" className="big-brothers-notice success">{handoffMessage}</p>}<p className="queue-reference">Queue reference <strong>{queueReference || "Recorded"}</strong></p>{queueReceiptUrl ? <a className="big-brothers-button primary" href={queueReceiptUrl} target="_blank" rel="noreferrer">Open branded walk-in receipt / PDF ↗</a> : <><p className="field-hint" role="status">{queueReceiptError || "Preparing your branded walk-in receipt…"}</p><button type="button" className="big-brothers-button secondary" disabled={!online} onClick={() => void retryQueueReceipt()}>Retry receipt</button></>}<div className="bb-help-teaser queue-handoff-help" role="note"><button type="button" aria-label="Dismiss hand-back help" onClick={() => setHelpTeaserDismissed(true)}>×</button><strong>Need a hand?</strong><p>Check your own WhatsApp for the Big Brothers link. Once it is on your phone, please hand this phone back to the Brothers. If the link has not come through, let the team know so they can prepare it again when there is a connection.</p></div><Link className="big-brothers-button secondary" href="/#big-brothers-racing">Racing fans: play while you wait ↗</Link><button type="button" className="big-brothers-button secondary" onClick={() => void finishQueueHandoff()}>Finish &amp; hand back phone</button></> : <><p>This request is not yet in the shared queue. Keep this screen open until the phone reconnects and the server confirms the upload.</p><p className="queue-reference">Saved draft <strong>{queueReference || "On this device"}</strong></p><button type="button" className="big-brothers-button secondary" disabled={!online} onClick={() => void syncOfflineRequests()}>Retry sync</button><button type="button" className="big-brothers-button secondary" onClick={discardOfflineQueueDraft}>Discard saved request &amp; clear session</button></>}
      {handoffError && <p role="alert" className="big-brothers-notice error">{handoffError}</p>}
    </section></main>;
  }

  return <main className="vula bb-cinematic-home">
    <header className="big-brothers-nav cinematic-nav"><Link href="/" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></Link><nav><Link href="/account" aria-label="My Big Brothers Car Wash Account">My BB CW Account</Link><a href="/admin" className="cinematic-staff-link">Staff ↗</a></nav></header>
    <section className="bb-cinema-hero" aria-label="Big Brothers Car Wash in Gaborone">
      <div className="bb-cinema-video">{!heroMediaUnavailable ? <video autoPlay muted loop playsInline preload="none" aria-label="Big Brothers Car Wash wash-bay film" src="/videos/Bays.mp4" onError={() => setHeroMediaUnavailable(true)} /> : <div className="bb-cinema-video-fallback"><span className="big-brothers-mark">BB</span><strong>Wash. Care. Go.</strong><small>Big Brothers Car Wash · G-West, Gaborone</small></div>}</div><div className="bb-cinema-shade" />
      <div className="bb-cinema-copy"><p className="big-brothers-eyebrow">G-WEST · GABORONE · BOTSWANA</p><p className="bb-cinema-kicker">Dumela, Gaborone.</p><h1>Your ride.<br/><em>Our brotherhood.</em></h1><p className="bb-cinema-intro">Pull in, get looked after, and get back out there. A better wash day starts right here.</p><div className="bb-cinema-live"><span className="status-dot" /> G-WEST WASH BAY <span>·</span> GABORONE</div><div className="bb-cinema-actions"><button type="button" className="bb-cinema-primary-action" onClick={() => {setTab("book");setHomeDestination("queue");window.setTimeout(() => document.getElementById("request")?.scrollIntoView({behavior:"smooth",block:"start"}),80);}}>BOOK A WASH <span aria-hidden="true">→</span></button><div className="bb-cinema-shortcuts"><Link href="/account" aria-label="My Big Brothers Car Wash Account">My BB CW Account ↗</Link><button type="button" onClick={() => {setHomeDestination("racing");window.setTimeout(() => document.getElementById("big-brothers-racing")?.scrollIntoView({behavior:"smooth",block:"start"}),80);}}>Racing garage ↗</button></div><div className="bb-home-utilities"><details className="bb-home-weather"><summary>Gaborone weather <span>· live local conditions</span></summary><LocationWeather showLocationGuide={false}/></details><div className="bb-onsite-team" aria-label="On-site staff walk-in tools"><span className="bb-onsite-team-label">ON-SITE TEAM</span><button type="button" onClick={() => {setQueueEntryMode("staff");setTab("queue");setHomeDestination("queue");window.setTimeout(() => document.getElementById("request")?.scrollIntoView({behavior:"smooth",block:"start"}),80);}}>Open walk-in queue <span aria-hidden="true">↗</span></button></div></div></div></div>
    </section>
    <section className="big-brothers-section request-section cinematic-destination-panel" id="request" hidden={homeDestination !== "queue"}><div className="destination-panel-top"><span className="big-brothers-eyebrow">{tab === "book" ? "BOOK A WASH" : "ON-SITE TEAM · WALK-IN"}</span><button type="button" className="destination-close" onClick={() => setHomeDestination("home")}>Back to welcome ×</button></div><div className="section-title"><p className="big-brothers-eyebrow">{tab === "book" ? "FUTURE WASH BOOKING" : "WALK-IN INTAKE"}</p><h2>{tab === "book" ? "Plan your next wash." : <>Add a customer to the<br/><em>walk-in queue.</em></>}</h2><p>{tab === "book" ? "Choose a preferred time. The team will review availability and confirm your request." : queueEntryMode === "staff" ? "Record the customer's details, or hand over the device so they can complete their own details." : "A few quick details and you’re in. Send the app link to your own WhatsApp so Big Brothers can stay with you after the wash."}</p><p className="bb-returning-customer">Been here before? <Link href="/account" aria-label="My Big Brothers Car Wash Account">Open My BB CW Account &amp; receipts ↗</Link> to find your wash history and request your next visit.</p></div><div className="request-panel">{tab === "book" && <div className="request-tabs"><strong>FUTURE WASH REQUEST</strong></div>}<form onSubmit={submitRequest} className="big-brothers-form"><div className="form-intro"><strong>{tab === "book" ? "Request your next wash" : "Customer details"}</strong><span>{tab === "book" ? "Choose a preferred date and time; the team will confirm availability." : queueEntryMode === "staff" ? "You are assisting the customer. Confirm the wash price face-to-face and enter the agreed amount below." : "Enter your details, choose your wash and add an optional thank-you tip for the Brothers if you wish."}</span></div>
      {tab==="book"&&<><div className="mode-switch"><button type="button" className={mode==="site"?"selected":""} onClick={()=>setMode("site")}>At the wash</button><button type="button" className={mode==="mobile"?"selected":""} onClick={()=>setMode("mobile")}>Mobile service</button></div>{mode==="mobile"&&<p className="coverage-note">{mobileCoverage.length?"Coverage will be checked against: "+mobileCoverage.join(", "):"Mobile coverage is not yet published. This is a request for review, not a confirmed mobile booking."}</p>}</>}
      {tab==="fleet"&&<label>Business / fleet name<input name="businessName" required maxLength={160} placeholder="Business name"/></label>}
      <div className="form-grid">{tab!=="book"&&<><label>Customer’s name<input name="customerName" required maxLength={120} autoComplete="name" placeholder="Customer’s full name" value={customerNameInput} onChange={e=>setCustomerNameInput(e.target.value)}/></label><label>Customer’s WhatsApp number<input name="phone" type="tel" inputMode="tel" required maxLength={18} autoComplete="tel" placeholder="+267 7X XXX XXX" value={phoneInput||"+267 "} onFocus={()=>{if(!phoneInput)setPhoneInput("+267 ");}} onChange={e=>setPhoneInput(formatBotswanaPhoneInput(e.target.value))} onBlur={()=>{if(botswanaPhoneDigits(phoneInput).length===8)setNotice({kind:"success",text:"WhatsApp number complete — 8 of 8 digits entered."});else if(botswanaPhoneDigits(phoneInput).length>0)setNotice({kind:"error",text:"Botswana numbers need all 8 digits after +267. "+botswanaPhoneDigits(phoneInput).length+"/8 entered."});}}/></label>{tab==="queue"&&<label className="full-field">Who is filling in these details?<select name="enteredBy" value={queueEntryMode} onChange={e=>{const next=e.target.value==="staff"?"staff":"customer";setQueueEntryMode(next);if(next==="staff"){setTipChoice("0");setCustomTipAmount("");}}}><option value="customer">I am the customer</option><option value="staff">I am Big Brothers staff helping the customer</option></select><small>This tells us who is holding the wash phone. The name and WhatsApp above must belong to the customer who will receive the link.</small></label>}<p className="field-hint full-field">{tab==="queue"?"Use the customer’s own WhatsApp number—not the wash phone number. After the queue entry is accepted, send the app link to that customer so they can keep their receipts and book their next wash.":"Use your own WhatsApp number so the team can contact you about this wash request."} · 8 digits after +267 · {botswanaPhoneDigits(phoneInput).length}/8 entered.</p>{tab==="queue"&&<label>Email (optional)<input name="email" type="email" maxLength={254} autoComplete="email" placeholder="For your receipt link"/></label>}<label>Describe your car (optional)<input name="vehicleType" maxLength={80} placeholder="e.g. silver SUV, blue hatchback"/></label></>}</div>
      {tab==="book"&&<>
        <div className="bb-booking-step"><span>01</span><div><strong>Choose your wash</strong><small>Select a service or keep the general request.</small></div></div>
        <div className="bb-service-picker-summary"><div><span>SELECTED SERVICE</span><strong>{selectedBookingService ? selectedBookingService.name : "General car wash request"}</strong><small>{selectedBookingService && typeof selectedBookingService.price === "number" ? money(selectedBookingService.price) : "The team can discuss your wash when confirming."}</small></div><button type="button" onClick={()=>setServicePickerOpen(true)} aria-haspopup="dialog" aria-expanded={servicePickerOpen}>{selectedBookingService?"Change service":"Choose service"} <b>→</b></button></div>
        {servicePickerOpen&&<div className="bb-booking-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setServicePickerOpen(false)}}><section className="bb-booking-modal" role="dialog" aria-modal="true" aria-labelledby="bb-service-picker-title" onKeyDown={event=>{if(event.key==="Escape")setServicePickerOpen(false)}}><header><div><span>BIG BROTHERS SERVICE MENU</span><h3 id="bb-service-picker-title">What are we washing?</h3><p>Choose a published service or keep the general request.</p></div><button type="button" aria-label="Close service selector" onClick={()=>setServicePickerOpen(false)}>×</button></header><div className="bb-booking-modal-list"><button type="button" className={!bookingServiceId?"selected":""} onClick={()=>{setBookingServiceId("");setServicePickerOpen(false)}}><span>General car wash request</span><b>Discuss with team</b>{!bookingServiceId&&<i>✓</i>}</button>{activeServices.filter(service=>typeof service.price==="number"&&service.price>=0).map(service=><button type="button" key={service.id} className={bookingServiceId===service.id?"selected":""} onClick={()=>{setBookingServiceId(service.id);setServicePickerOpen(false)}}><span>{service.name}</span><b>{money(service.price)}</b>{bookingServiceId===service.id&&<i>✓</i>}</button>)}</div><footer><span>Service prices are shown where published.</span><button type="button" onClick={()=>setServicePickerOpen(false)}>Done</button></footer></section></div>}
        <div className="bb-booking-step"><span>02</span><div><strong>Choose your day</strong><small>Requests are made at least one day ahead. The team confirms your appointment.</small></div></div>
        <div className="bb-booking-calendar"><div className="bb-booking-calendar-header"><button type="button" aria-label="Previous month" disabled={bookingMonth<=minimumBookingDate.slice(0,7)} onClick={()=>shiftBookingMonth(-1)}>‹</button><strong>{bookingMonthLabel}</strong><button type="button" aria-label="Next month" onClick={()=>shiftBookingMonth(1)}>›</button></div><div className="bb-booking-weekdays">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day=><span key={day}>{day}</span>)}</div><div className="bb-booking-days">{Array.from({length:(new Date(bookingMonth+"-01T12:00:00Z").getUTCDay()+6)%7},(_,index)=><span key={"blank-"+index}/>)}{bookingCalendarDays.map(day=>{const closed=Array.isArray(settings.closedDays)&&settings.closedDays.map(item=>String(item).toLowerCase()).includes(bookingDayName(day.key));const disabled=day.key<minimumBookingDate||closed;return <button type="button" key={day.key} disabled={disabled} className={(bookingDate===day.key?"selected ":"")+(closed?"closed":"")} aria-pressed={bookingDate===day.key} aria-label={bookingDateLabel(day.key)+(closed?", closed": "")} onClick={()=>{setBookingDate(day.key);setBookingTime("");}}>{day.day}{closed&&<i>×</i>}</button>})}</div><div className="bb-booking-calendar-legend"><span><i/> Available to request</span><span><i className="closed"/> Closed</span></div>{bookingDate&&<div className="bb-booking-selected-date"><span>YOUR SELECTED DATE</span><strong>{bookingDateLabel(bookingDate)}</strong><BookingDateWeather date={bookingDate}/><button type="button" onClick={()=>{setBookingDate("");setBookingTime("")}}>Change date</button></div>}</div>
        <div className="bb-booking-step"><span>03</span><div><strong>Choose a preferred time</strong><small>These are preferences; staff will confirm availability.</small></div></div>
        <div className="bb-booking-time-summary"><div><strong>{bookingTime||"Choose a preferred time"}</strong><small>{availabilityMessage||"Choose a date first. The team will confirm availability."}</small></div><button type="button" disabled={!bookingDate||availabilityLoading||(availabilityConfigured===true&&!availableSlots.length)} onClick={()=>setTimePickerOpen(true)}>{bookingTime?"Change time":"Choose time"} →</button></div>
        {timePickerOpen&&<div className="bb-booking-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setTimePickerOpen(false)}}><section className="bb-booking-time-modal" role="dialog" aria-modal="true" aria-labelledby="bb-time-picker-title" onKeyDown={event=>{if(event.key==="Escape")setTimePickerOpen(false)}}><header><div><span>PREFERRED TIME</span><h3 id="bb-time-picker-title">When works for you?</h3><p>{availabilityMessage||"Choose a preferred time. The team will confirm your request."}</p></div><button type="button" aria-label="Close time selector" onClick={()=>setTimePickerOpen(false)}>×</button></header>{availabilityConfigured===true?<div className="bb-booking-time-slots">{availableSlots.map(slot=><button type="button" key={slot} className={bookingTime===slot?"selected":""} aria-pressed={bookingTime===slot} onClick={()=>{setBookingTime(slot);setTimePickerOpen(false)}}>{slot}</button>)}</div>:<div className="bb-booking-time-manual"><label>Preferred time<input type="time" min={typeof settings.openingTime==="string"&&settings.openingTime?settings.openingTime:undefined} max={typeof settings.closingTime==="string"&&settings.closingTime?settings.closingTime:undefined} step={1800} value={bookingTime} onChange={event=>setBookingTime(event.target.value)}/></label><small>{availabilityMessage||"The team has not published live time slots yet. Choose a preference for staff to review."}</small><button type="button" disabled={!bookingTime} onClick={()=>setTimePickerOpen(false)}>Use this time</button></div>}<footer><span>Preferred time only — not a confirmed slot.</span></footer></section></div>}
        <input type="hidden" name="preferredDate" value={bookingDate}/><input type="hidden" name="preferredTime" value={bookingTime}/><input type="hidden" name="scheduledFor" value={bookingDate&&bookingTime?bookingDate+"T"+bookingTime+":00+02:00":""}/>
        <label className="full-field">Area / address<input name="address" maxLength={500} required={mode==="mobile"} placeholder={mode==="mobile"?"Area, street or landmark":"Optional site note"}/></label>
        <label>Payment preference<select name="paymentMethod" defaultValue="pay-on-site"><option value="pay-on-site">Cash · pay at the wash / on completion</option><option value="orange-money">Orange Money · pay directly to Big Brothers</option><option value="fnb-ewallet">FNB eWallet · pay directly to Big Brothers</option></select><small>Choose how you would prefer to pay. No payment is collected in this booking form; the team will confirm payment details and record payment after it is received.</small></label>
        <div className="bb-tip-panel bb-booking-zaka full-field"><div><span className="bb-tip-eyebrow">OPTIONAL THANK-YOU</span><strong>Leave the Brothers a little Zaka? 🤝</strong><p>A little extra for the team if you feel they looked after your ride. Completely optional and separate from the wash price.</p></div><div className="bb-tip-choices" role="group" aria-label="Choose an optional Zaka amount">{[{value:"0",label:"No tip",emoji:"🙂"},{value:"5",label:"P5",emoji:"🪙"},{value:"10",label:"P10",emoji:"🪙"},{value:"20",label:"P20",emoji:"💰"},{value:"custom",label:"Custom",emoji:"✍️"}].map(option=><button type="button" key={option.value} className={bookingTipChoice===option.value?"selected":""} aria-pressed={bookingTipChoice===option.value} onClick={()=>setBookingTipChoice(option.value)}><span aria-hidden="true">{option.emoji}</span><strong>{option.label}</strong></button>)}</div><input type="hidden" name="tipAmount" value={bookingTipChoice==="custom"?bookingCustomTipAmount:bookingTipChoice}/>{bookingTipChoice==="custom"&&<label className="bb-custom-tip">Your Zaka (BWP)<input name="customTipAmount" type="number" min="0.01" max="1000000" step="0.01" value={bookingCustomTipAmount} onChange={event=>setBookingCustomTipAmount(event.target.value)} placeholder="Enter any amount"/></label>}<div className="bb-tip-summary"><div><span>Selected wash</span><strong>{selectedBookingService&&typeof selectedBookingService.price==="number"?money(selectedBookingService.price):"General request"}</strong></div><div><span>Optional Zaka</span><strong>{money(bookingTipValue)}</strong></div></div><small className="field-hint">Your Zaka is recorded separately from the wash charge. No payment is collected in the app.</small></div>
      </>}
      {tab==="queue"&&<><label>Service &amp; price<select value={serviceId} onChange={e=>setServiceId(e.target.value)} required><option value="">Choose a service or propose an amount</option>{activeServices.filter(s=>typeof s.price==="number"&&s.price>=0).map(s=><option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}<option value="customer-offer">I’d like to propose my own price</option></select></label>{serviceId==="customer-offer"&&queueEntryMode==="customer"&&<label>Your proposed amount (BWP)<input name="customerOfferAmount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="e.g. 80"/><small>This is a proposal only. The attendant and you agree the final price before payment.</small></label>}{serviceId==="customer-offer"&&queueEntryMode==="staff"&&<label>Agreed wash price (BWP)<input name="staffAgreedWashPrice" type="number" min="0.01" max="1000000" step="0.01" required value={staffAgreedWashPrice} onChange={e=>setStaffAgreedWashPrice(e.target.value)} placeholder="Amount agreed face-to-face"/><small>Confirm this custom amount with the customer before submitting.</small></label>}{queueEntryMode==="customer"&&<div className="bb-tip-panel full-field"><div><span className="bb-tip-eyebrow">OPTIONAL THANK-YOU</span><strong>Leave the Brothers a little Zaka? 🤝</strong><p>A little extra for the team if you feel they looked after your ride. This is optional and separate from your wash price.</p></div><div className="bb-tip-choices" role="group" aria-label="Choose an optional tip amount">{[{value:"0",label:"No tip",emoji:"🙂"},{value:"5",label:"P5",emoji:"🪙"},{value:"10",label:"P10",emoji:"🪙"},{value:"20",label:"P20",emoji:"💰"},{value:"custom",label:"Custom",emoji:"✍️"}].map(option=><button type="button" key={option.value} className={tipChoice===option.value?"selected":""} aria-pressed={tipChoice===option.value} onClick={()=>setTipChoice(option.value)}><span aria-hidden="true">{option.emoji}</span><strong>{option.label}</strong></button>)}</div><input type="hidden" name="tipAmount" value={tipChoice==="custom"?customTipAmount:tipChoice}/>{tipChoice==="custom"&&<label className="bb-custom-tip">Your tip (BWP)<input name="customTipAmount" type="number" min="0.01" max="1000000" step="0.01" required value={customTipAmount} onChange={e=>setCustomTipAmount(e.target.value)} placeholder="Enter any amount"/></label>}<div className="bb-tip-summary"><div><span>Selected wash</span><strong>{selectedQueueService ? money(selectedQueueService.price) : serviceId === "customer-offer" ? "Price to agree" : "Choose a service"}</strong></div><div><span>Optional tip</span><strong>{money(customerTipValue)}</strong></div>{selectedQueueService&&typeof selectedQueueService.price==="number"&&<div className="bb-tip-total"><span>Wash + tip (if you choose to tip)</span><strong>{money(selectedQueueService.price + customerTipValue)}</strong></div>}</div><small className="field-hint">You and the team handle any transaction directly. The app does not collect or process this tip.</small></div>}</>}
      {tab==="fleet"&&<><label>Number of vehicles<input name="vehicleCount" type="number" min="1" max="10000" defaultValue="2" required/></label><label>Email (optional)<input name="email" type="email" maxLength={254} placeholder="you@company.com"/></label><label>Service needs<input name="fleetNeeds" maxLength={200} placeholder="e.g. regular cleaning"/></label><label>Preferred schedule<input name="preferredSchedule" maxLength={200} placeholder="Days / frequency"/></label><label>Preferred location<input name="preferredLocation" maxLength={200} defaultValue={locationName}/></label></>}
      <label className="full-field">Notes (optional)<textarea name="notes" maxLength={1000} rows={3} placeholder="Anything the team should know?"/></label>{tab==="book"&&<section className="bb-booking-final-details full-field" aria-labelledby="bb-booking-contact-title"><div className="bb-booking-step"><span>04</span><div><strong id="bb-booking-contact-title">Your contact details</strong><small>Just a few details so the Brothers know who to expect.</small></div></div><label>Customer’s name<input name="customerName" required maxLength={120} autoComplete="name" placeholder="Your full name" value={customerNameInput} onChange={e=>setCustomerNameInput(e.target.value)}/></label><label>Name of the person bringing the car<input name="broughtByName" required maxLength={120} autoComplete="name" placeholder="Who will bring the car? (you or someone else)" value={broughtByNameInput} onChange={e=>setBroughtByNameInput(e.target.value)}/></label><label>Customer’s WhatsApp number<input name="phone" type="tel" inputMode="tel" required maxLength={18} autoComplete="tel" placeholder="+267 7X XXX XXX" value={phoneInput||"+267 "} onFocus={()=>{if(!phoneInput)setPhoneInput("+267 ");}} onChange={e=>setPhoneInput(formatBotswanaPhoneInput(e.target.value))} onBlur={()=>{if(botswanaPhoneDigits(phoneInput).length===8)setNotice({kind:"success",text:"WhatsApp number complete — 8 of 8 digits entered."});else if(botswanaPhoneDigits(phoneInput).length>0)setNotice({kind:"error",text:"Botswana numbers need all 8 digits after +267. "+botswanaPhoneDigits(phoneInput).length+"/8 entered."});}}/><small>Use your own WhatsApp number so the team can contact you about this wash request. Enter the 8 digits after +267 · {botswanaPhoneDigits(phoneInput).length}/8 entered.</small></label><label>Describe your car (optional)<input name="vehicleType" maxLength={80} placeholder="e.g. silver SUV, blue hatchback"/></label></section>}{connectionError && tab==="queue" && <p className="big-brothers-notice pending">The standard wash price list could not load. You can still propose an amount for the attendant to consider. The attendant must agree the final price with you before the wash starts. No price or payment is confirmed by this request.</p>}<button className="big-brothers-button primary submit-button" disabled={busy}>{busy?"Sending…":tab==="book"?"Send booking request":tab==="queue"?(queueEntryMode==="staff"?"Add customer to walk-in queue":"Join the walk-in queue"):"Send fleet enquiry"} ↗</button>{notice&&<p role="status" className={"big-brothers-notice "+notice.kind}>{notice.text}</p>}</form></div></section> 
    {homeDestination === "racing" && (<><section className="big-brothers-section racing-section cinematic-destination-panel" id="big-brothers-racing" aria-label="Big Brothers Racing"><div className="destination-panel-top"><span className="big-brothers-eyebrow">BIG BROTHERS RACING</span><button type="button" className="destination-close" onClick={() => setHomeDestination("home")}>Back to welcome ×</button></div><RacingWarmup embedded startExpanded /></section></>)}
    <footer className="big-brothers-footer cinematic-footer"><Link href="/" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></Link><span>G-West, Gaborone · Wash. Care. Go.</span><Link href="/account" aria-label="My Big Brothers Car Wash Account">My BB CW Account</Link><a href="/iphone-install">Install on iPhone</a><a href="/admin">Staff sign in</a></footer>
    <aside className={"bb-help-widget"+(footerVisible?" is-footer-visible":"")} aria-label="Customer quick help">{chatOpen && <section className="bb-help-panel" aria-labelledby="bb-help-title"><p className="big-brothers-eyebrow">QUICK HELP · G-WEST</p><h2 id="bb-help-title">Dumela! How can we help?</h2><p>Your quick guide to Big Brothers. Choose a destination below.</p><button type="button" onClick={() => {setChatOpen(false);setTab("book");setHomeDestination("queue");window.setTimeout(() => document.getElementById("request")?.scrollIntoView({behavior:"smooth"}),80);}}>Book a wash ↗</button><Link href="/account" aria-label="My Big Brothers Car Wash Account" onClick={() => setChatOpen(false)}>My BB CW Account &amp; receipts ↗</Link><button type="button" onClick={() => {setChatOpen(false);setHomeDestination("racing");window.setTimeout(() => document.getElementById("big-brothers-racing")?.scrollIntoView({behavior:"smooth"}),80);}}>Race while you wait ↗</button><a href="https://www.google.com/maps/search/?api=1&amp;query=Big+Brothers+Car+Wash+G-West+Gaborone" target="_blank" rel="noreferrer" onClick={() => setChatOpen(false)}>Find Big Brothers · G-West ↗</a></section>}<button type="button" className="bb-help-launcher" aria-expanded={chatOpen} onClick={() => setChatOpen(open => !open)}><span aria-hidden="true">{chatOpen?"×":"?"}</span>{chatOpen?"Close help":"Need a hand?"}</button></aside>
  </main>;
}
