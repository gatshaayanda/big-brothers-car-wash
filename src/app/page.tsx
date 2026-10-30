/* eslint-disable react/no-unescaped-entities, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signInAnonymously, signOut } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, hasFirebaseWebConfig } from "@/lib/firebase/client";
import { subscribeServices, subscribeSettings, type VulaService } from "@/lib/firebase/big-brothers-data";
import "./big-brothers.css";
import LocationWeather from "@/components/LocationWeather";

type Notice = { kind: "success" | "error" | "pending"; text: string };
const pendingKey = "big-brothers-car-wash:offline-requests:v1";
const stamp = () => new Date().toISOString();
const money = (price?: number) => typeof price === "number" ? "P" + price.toLocaleString("en-BW", { maximumFractionDigits: 2 }) : "Price confirmed by the team";
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
function buildWhatsAppSelfLink(phone: string, appUrl: string) {
  const digits = normalizeWhatsAppDigits(phone);
  const message = "Thanks for choosing Big Brothers Car Wash! 🚗❤️\n\nWe appreciate you trusting us with your ride.\n\nYour Big Brothers account makes every visit easier. Keep your wash receipts and vehicle details together, check your wash history and book your next visit without starting from scratch.\n\nPlanning a regular wash routine? Your account makes it easier to come back and keep your ride looking its best.\n\nAccess your car wash account here:\n" + appUrl + "\n\nBig Brothers Car Wash\nWash. Care. Go. ❤️";
  return "https://wa.me/" + digits + "?text=" + encodeURIComponent(message);
}

export default function Home() {
  const [services, setServices] = useState<VulaService[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueHandoff, setQueueHandoff] = useState<"synced" | "offline" | null>(null);
  const [queueReference, setQueueReference] = useState("");
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
  const [chatOpen, setChatOpen] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const mobileCoverage = Array.isArray(settings.mobileCoverage) ? settings.mobileCoverage as string[] : [];
  const configuredBusinessName = typeof settings.businessName === "string" ? settings.businessName.trim() : "";
  const businessName = configuredBusinessName && !/car\s+a\s+wash|😎/i.test(configuredBusinessName) ? configuredBusinessName : "Big Brothers Car Wash";
  const locationName = typeof settings.locationName === "string" && settings.locationName.trim() ? settings.locationName : "G-West";
  const activeServices = useMemo(() => services.filter(s => s.active), [services]);
  const selectedQueueService = activeServices.find(service => service.id === serviceId);
  const customerTipValue = tipChoice === "custom" ? Number(customTipAmount || 0) : Number(tipChoice);

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
    const onOnline = () => { setOnline(true); void syncOfflineRequests(); };
    const onOffline = () => { setOnline(false); setNotice({ kind: "pending", text: "Offline: requests can be saved on this device, but the team cannot see them until they sync." }); };
    const stops = [subscribeServices(setServices, error => setConnectionError(error.message)), subscribeSettings(value => setSettings(value ?? {}), () => {})];
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    if (navigator.onLine) void syncOfflineRequests();
    return () => { stops.forEach(stop => stop()); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => { const params = new URLSearchParams(window.location.search); if (params.get("journey") === "book") { setTab("book"); setBookingDate(params.get("preferredDate") || ""); setBookingTime(params.get("preferredTime") || ""); } }, []);
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
    if (!drafts.length) return;
    try {
      const user = await ensureUser(); if (!user) return;
      const remaining: typeof drafts = [];
      const queueDraft = drafts.find(draft => draft.collection === "queueEntries");
      for (const draft of drafts) {
        try { const id = draft.id || crypto.randomUUID(); await saveCustomerRecord(user.uid, String(draft.data.customerName || draft.data.contactName || ""), String(draft.data.phone || ""), String(draft.data.email || user.email || "")); await setDoc(doc(db, draft.collection, id), { ...draft.data, customerId: user.uid, updatedAt: stamp() }); }
        catch { remaining.push(draft); }
      }
      localStorage.setItem(pendingKey, JSON.stringify(remaining));
      setNotice(remaining.length ? { kind: "pending", text: remaining.length + " saved request(s) still have not synced." } : { kind: "success", text: "Saved requests have synced to Big Brothers' system. Bookings still need staff confirmation." });
      if (queueDraft && !remaining.some(draft => draft.id === queueDraft.id)) { setQueueReference(queueDraft.id || ""); setQueueCustomerName(String(queueDraft.data.customerName || "")); setQueueWhatsAppPhone(String(queueDraft.data.phone || "")); setQueueEnteredBy(queueDraft.enteredBy === "staff" ? "staff" : "customer"); setQueueAppUrl(window.location.origin + "/account"); setQueueHandoff("synced"); }
    } catch { setNotice({ kind: "pending", text: "Sync is not complete. Your saved requests remain on this device." }); }
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const enteredBy = String(form.get("enteredBy") ?? "customer") === "staff" ? "staff" : "customer";
    const vehicleType = String(form.get("vehicleType") ?? "").trim();
    const vehicleDescription = String(form.get("vehicleType") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const customerOfferRaw = String(form.get("customerOfferAmount") ?? "").trim();
    const customerOfferAmount = customerOfferRaw ? Number(customerOfferRaw) : null;
    const customTipRaw = String(form.get("customTipAmount") ?? "").trim();
    const tipAmount = enteredBy === "customer" ? (tipChoice === "custom" ? Number(customTipRaw) : Number(form.get("tipAmount") ?? 0)) : 0;
    const agreedWashPriceRaw = String(form.get("staffAgreedWashPrice") ?? "").trim();
    const agreedWashPrice = agreedWashPriceRaw ? Number(agreedWashPriceRaw) : null;
    const now = stamp();
    if (!customerName || !phone) { setNotice({ kind: "error", text: "Enter your name and WhatsApp number." }); return; }
    if (tab === "queue" && !/^\d{8,15}$/.test(normalizeWhatsAppDigits(phone))) { setNotice({ kind: "error", text: "Enter a valid WhatsApp number with its country code (Botswana numbers can use +267 or the local 8-digit number)." }); return; }
    if (tab === "queue" && !serviceId) { setNotice({ kind: "error", text: "Choose a listed wash service or select “I’d like to propose my own price” to enter an amount for the attendant to consider." }); return; }
    if (tab === "queue" && enteredBy === "customer" && (!Number.isFinite(tipAmount) || tipAmount < 0 || tipAmount > 1000000)) { setNotice({ kind: "error", text: "Enter a valid optional tip amount, or choose No tip." }); return; }
    if (tab === "queue" && enteredBy === "customer" && tipChoice === "custom" && (!customTipRaw || !Number.isFinite(tipAmount) || tipAmount <= 0)) { setNotice({ kind: "error", text: "Enter a custom tip greater than P0, or choose No tip." }); return; }
    if (tab === "queue" && enteredBy === "staff" && serviceId === "customer-offer" && (agreedWashPrice === null || !Number.isFinite(agreedWashPrice) || agreedWashPrice <= 0 || agreedWashPrice > 1000000)) { setNotice({ kind: "error", text: "Enter the wash price agreed face-to-face with the customer." }); return; }
    setBusy(true); setNotice(null);
    let submissionStage: "authentication" | "customer profile" | "queue entry" | "booking request" | "fleet enquiry" = "authentication";
    try {
      const common: Record<string, unknown> = { customerName, phone, vehicleType: vehicleDescription || "Not described", vehicleRegistration: "", notes, createdAt: now, updatedAt: now };
      let collectionName: string; let data: Record<string, unknown>;
      if (tab === "book") {
        const address = String(form.get("address") ?? "").trim(); const scheduledInput = String(form.get("scheduledFor") ?? "");
        if (mode === "mobile" && !address) throw new Error("Enter the area or address for the mobile coverage check.");
        if (!scheduledInput) throw new Error("Choose your preferred date and time.");
        const scheduledDate = new Date(scheduledInput);
        if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) throw new Error("Choose a future date and time.");
        const closedDays = Array.isArray(settings.closedDays) ? settings.closedDays.map(day => String(day).toLowerCase()) : [];
        const dayName = scheduledDate.toLocaleDateString("en-US", { weekday: "long", timeZone: "Africa/Gaborone" }).toLowerCase();
        if (closedDays.includes(dayName)) throw new Error("That day is marked closed by Big Brothers. Choose another date.");
        const scheduledFor = scheduledDate.toISOString();
        collectionName = "bookings";
        data = { ...common, serviceId: serviceId || "general-request", serviceName: activeServices.find(s => s.id === serviceId)?.name || "General car wash request", serviceMode: mode, locationId: mode === "site" ? locationName : "coverage-review", address, scheduledFor, paymentMethod: String(form.get("paymentMethod") || "pay-on-site"), paymentStatus: "unpaid", status: "requested" };
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
        const saved = JSON.parse(localStorage.getItem(pendingKey) || "[]") as Array<unknown>;
        const localId = crypto.randomUUID(); saved.push({ id: localId, collection: collectionName, data, ...(tab === "queue" ? { enteredBy } : {}) }); localStorage.setItem(pendingKey, JSON.stringify(saved)); formElement.reset();
        if (tab === "queue") { setQueueReference(localId); setQueueCustomerName(customerName); setQueueWhatsAppPhone(phone); setQueueEnteredBy(enteredBy); setQueueAppUrl(window.location.origin + "/account"); setQueueHandoff("offline"); }
        setNotice({ kind: "pending", text: "Saved on this device only. It is not visible to the team or a confirmed booking until it syncs." }); return;
      }
      const user = await ensureUser();
      if (!user) throw new Error("Online service is not configured yet. Your request has not been sent.");
      submissionStage = "customer profile";
      await saveCustomerRecord(user.uid, customerName, phone, String(form.get("email") || user.email || ""));
      submissionStage = tab === "queue" ? "queue entry" : tab === "book" ? "booking request" : "fleet enquiry";
      const requestRef = doc(collection(db, collectionName));
      const writePromise = setDoc(requestRef, { ...data, customerId: user.uid });
      setNotice({ kind: "pending", text: "Sending securely to Big Brothers' system…" });
      await writePromise;
      formElement.reset();
      if (tab === "queue") { setQueueReference(requestRef.id); setQueueCustomerName(customerName); setQueueWhatsAppPhone(phone); setQueueEnteredBy(enteredBy); setQueueAppUrl(window.location.origin + "/account"); setQueueHandoff("synced"); }
      setNotice({ kind: "success", text: tab === "queue" ? "You’re on the shared queue. Staff can send your secure receipt and account link to this WhatsApp number after the wash is completed." : "Your booking request reached Big Brothers. The team will check availability and confirm it with you." });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown Firebase error.";
      const permissionDenied = typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "permission-denied";
      const stageMessage = permissionDenied
        ? `Firebase denied the ${submissionStage} step. No queue entry was confirmed. Check that the published rules match the Big Brothers app and that this app is connected to the intended Vula Firebase project.`
        : `The ${submissionStage} step failed: ${detail}`;
      setNotice({ kind: "error", text: stageMessage });
    } finally { setBusy(false); }
  }

  async function finishQueueHandoff() {
    setHandoffError("");
    try {
      await signOut(auth);
      setQueueHandoff(null);
      setQueueReference("");
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

  if (queueHandoff) {
    return <main className="vula queue-handoff-page"><section className="queue-handoff-card" aria-labelledby="queue-handoff-title">
      <span className="big-brothers-eyebrow">BIG BROTHERS CAR WASH · WALK-IN</span>
      <h1 id="queue-handoff-title">{queueHandoff === "synced" ? "You're in the queue." : "Your request is saved here."}</h1>
      {queueHandoff === "synced" ? <><div className="queue-customer-confirm"><span aria-hidden="true">✅</span><div><strong>{queueCustomerName || "Customer"}, your place is saved.</strong><p>Your details are now in the shared Big Brothers staff queue.</p></div></div><a className="big-brothers-button primary whatsapp-self-send queue-whatsapp-primary" href={buildWhatsAppSelfLink(queueWhatsAppPhone, queueAppUrl)} target="_blank" rel="noreferrer">📲 Send the Big Brothers link to {queueCustomerName || "your"}’s WhatsApp ↗</a><p className="field-hint queue-trust-copy">One quick step: tap the button to open WhatsApp, check that the number is yours, then press <strong>Send</strong>. Open the account link on your own phone to access your Big Brothers car wash account. Nothing is sent until you press Send.</p><p className="queue-reference">Official app address <strong>{queueAppUrl.replace("https://", "").replace("http://", "")}</strong> <span>· Opens Big Brothers Car Wash</span></p><p className="queue-reference">Sent by: <strong>{queueEnteredBy === "staff" ? "Big Brothers staff assisting" : "Customer"}</strong></p><button type="button" className="big-brothers-button secondary" onClick={() => void copyQueueAppLink()}>Copy app link</button>{handoffMessage && <p role="status" className="big-brothers-notice success">{handoffMessage}</p>}<p className="queue-reference">Queue reference <strong>{queueReference || "Recorded"}</strong></p><a className="big-brothers-button secondary" href="/games">Racing fans: play while you wait ↗</a><button type="button" className="big-brothers-button secondary" onClick={() => void finishQueueHandoff()}>Finish &amp; hand back phone</button></> : <><p>This request is not yet in the shared queue. Keep this screen open until the phone reconnects and the server confirms the upload.</p><p className="queue-reference">Saved draft <strong>{queueReference || "On this device"}</strong></p><button type="button" className="big-brothers-button secondary" disabled={!online} onClick={() => void syncOfflineRequests()}>Retry sync</button><button type="button" className="big-brothers-button secondary" onClick={discardOfflineQueueDraft}>Discard saved request &amp; clear session</button></>}
      {handoffError && <p role="alert" className="big-brothers-notice error">{handoffError}</p>}
    </section></main>;
  }

  return <main className="vula">
    <header className="big-brothers-nav"><a href="#request" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><nav><a href="/account" aria-label="My Big Brothers Car Wash Account">My washes</a><a href="#big-brothers-racing">Racing</a></nav><a className="big-brothers-cta" href="#request" onClick={() => setTab("queue")}>Join the queue ↗</a></header>
    <section className="bb-daily-hero" aria-label="Big Brothers Car Wash welcome">
      <div className="bb-daily-hero-copy">
        <p className="big-brothers-eyebrow">G-WEST, GABORONE · YOUR LOCAL CAR WASH</p>
        <h1>Wash. Care. <em>Go.</em></h1>
        <p>Like a big brother, we've got your ride. Pull in for a wash, keep your receipts close and make the next visit easy.</p>
        <div className="bb-daily-hero-actions"><a className="big-brothers-button primary" href="#request" onClick={() => setTab("queue")}>🚗 Join the walk-in queue</a><a className="bb-daily-account-link" href="/account">Already washed with us? My account ↗</a></div>
      </div>
      <div className="bb-daily-hero-media">
        <video autoPlay muted loop playsInline preload="none" aria-label="Big Brothers Car Wash wash-bay footage" src="/videos/Bays.mp4" />
        <div><span>BIG BROTHERS CAR WASH</span><strong>Your ride is in good hands.</strong></div>
      </div>
      <div className="bb-daily-weather"><LocationWeather showLocationGuide={false}/></div>
    </section>
    <section className="big-brothers-section request-section" id="request"><div className="section-title"><p className="big-brothers-eyebrow">WALK-IN INTAKE</p><h2>{tab === "book" ? "Plan your next wash." : <>Join the<br/><em>walk-in queue.</em></>}</h2><p>{tab === "book" ? "Choose a preferred time. The team will confirm your request." : "A few quick details and you’re in. Send the app link to your own WhatsApp so Big Brothers can stay with you after the wash."}</p><p className="bb-returning-customer">Been here before? <a href="/account">Open My washes &amp; receipts ↗</a> to find your wash history and request your next visit.</p></div><div className="request-panel">{tab === "book" && <div className="request-tabs"><strong>FUTURE WASH REQUEST</strong><button type="button" onClick={() => setTab("queue")}>Back to walk-in queue</button></div>}<form onSubmit={submitRequest} className="big-brothers-form"><div className="form-intro"><strong>{tab === "book" ? "Request your next wash" : "Customer details"}</strong><span>{tab === "book" ? "Choose a preferred date and time; the team will confirm availability." : queueEntryMode === "staff" ? "You are assisting the customer. Confirm the wash price face-to-face and enter the agreed amount below." : "Enter your details, choose your wash and add an optional thank-you tip for the Brothers if you wish."}</span></div>
      {tab==="book"&&<><div className="mode-switch"><button type="button" className={mode==="site"?"selected":""} onClick={()=>setMode("site")}>At the wash</button><button type="button" className={mode==="mobile"?"selected":""} onClick={()=>setMode("mobile")}>Mobile service</button></div>{mode==="mobile"&&<p className="coverage-note">{mobileCoverage.length?"Coverage will be checked against: "+mobileCoverage.join(", "):"Mobile coverage is not yet published. This is a request for review, not a confirmed mobile booking."}</p>}</>}
      {tab==="fleet"&&<label>Business / fleet name<input name="businessName" required maxLength={160} placeholder="Business name"/></label>}
      <div className="form-grid"><label>Customer’s name<input name="customerName" required maxLength={120} autoComplete="name" placeholder="Name of the person bringing the car" value={customerNameInput} onChange={e=>setCustomerNameInput(e.target.value)}/></label><label>Customer’s WhatsApp number<input name="phone" inputMode="tel" required maxLength={40} autoComplete="tel" placeholder="+267 …"/></label>{tab==="queue"&&<label className="full-field">Who is filling in these details?<select name="enteredBy" value={queueEntryMode} onChange={e=>{const next=e.target.value==="staff"?"staff":"customer";setQueueEntryMode(next);if(next==="staff"){setTipChoice("0");setCustomTipAmount("");}}}><option value="customer">I am the customer</option><option value="staff">I am Big Brothers staff helping the customer</option></select><small>This tells us who is holding the wash phone. The name and WhatsApp above must belong to the customer who will receive the link.</small></label>}<p className="field-hint full-field">Use the customer’s own WhatsApp number—not the wash phone number. After the queue entry is accepted, send the app link to that customer so they can keep their receipts and book their next wash.</p>{tab==="queue"&&<label>Email (optional)<input name="email" type="email" maxLength={254} autoComplete="email" placeholder="For your receipt link"/></label>}<label>{customerNameInput.trim() ? `Describe ${customerNameInput.trim().split(/\s+/)[0]}’s car (optional)` : "Describe your car (optional)"}<input name="vehicleType" maxLength={80} placeholder="e.g. silver SUV, blue hatchback"/></label>
      {tab==="book"&&<><label>Service<select value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="">General car wash request</option>{activeServices.filter(s=>typeof s.price==="number"&&s.price>=0).map(s=><option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}</select></label><label>Preferred date<input type="date" name="preferredDate" min={new Date().toISOString().slice(0,10)} value={bookingDate} onChange={e=>setBookingDate(e.target.value)} required/></label><label>Preferred time{availabilityConfigured===true?<select name="preferredTime" value={bookingTime} onChange={e=>setBookingTime(e.target.value)} required disabled={availabilityLoading||availableSlots.length===0}><option value="">{availabilityLoading?"Checking times…":availableSlots.length?"Choose an available time":"No times available"}</option>{availableSlots.map(time=><option key={time} value={time}>{time}</option>)}</select>:<input type="time" name="preferredTime" min={typeof settings.openingTime==="string"&&settings.openingTime?settings.openingTime:undefined} max={typeof settings.closingTime==="string"&&settings.closingTime?settings.closingTime:undefined} step={1800} value={bookingTime} onChange={e=>setBookingTime(e.target.value)} required/>}<small>{availabilityMessage||"Choose a preferred time; staff will confirm availability."}</small></label><input type="hidden" name="scheduledFor" value={bookingDate && bookingTime ? `${bookingDate}T${bookingTime}` : ""}/><label>Area / address<input name="address" maxLength={500} required={mode==="mobile"} placeholder={mode==="mobile"?"Area, street or landmark":"Optional site note"}/></label><label>Payment preference<select name="paymentMethod" defaultValue="pay-on-site"><option value="pay-on-site">Pay at the wash / on completion</option><option value="online-payment-request">Request online payment instructions</option></select></label></>}
      {tab==="queue"&&<><label>Service &amp; price<select value={serviceId} onChange={e=>setServiceId(e.target.value)} required><option value="">Choose a service or propose an amount</option>{activeServices.filter(s=>typeof s.price==="number"&&s.price>=0).map(s=><option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}<option value="customer-offer">I’d like to propose my own price</option></select></label>{serviceId==="customer-offer"&&queueEntryMode==="customer"&&<label>Your proposed amount (BWP)<input name="customerOfferAmount" type="number" min="0.01" max="1000000" step="0.01" required placeholder="e.g. 80"/><small>This is a proposal only. The attendant and you agree the final price before payment.</small></label>}{serviceId==="customer-offer"&&queueEntryMode==="staff"&&<label>Agreed wash price (BWP)<input name="staffAgreedWashPrice" type="number" min="0.01" max="1000000" step="0.01" required value={staffAgreedWashPrice} onChange={e=>setStaffAgreedWashPrice(e.target.value)} placeholder="Amount agreed face-to-face"/><small>Confirm this custom amount with the customer before submitting.</small></label>}{queueEntryMode==="customer"&&<div className="bb-tip-panel full-field"><div><span className="bb-tip-eyebrow">OPTIONAL THANK-YOU</span><strong>Leave the Brothers a little Zaka? 🤝</strong><p>A little extra for the team if you feel they looked after your ride. This is optional and separate from your wash price.</p></div><div className="bb-tip-choices" role="group" aria-label="Choose an optional tip amount">{[{value:"0",label:"No tip",emoji:"🙂"},{value:"5",label:"P5",emoji:"🪙"},{value:"10",label:"P10",emoji:"🪙"},{value:"20",label:"P20",emoji:"💰"},{value:"custom",label:"Custom",emoji:"✍️"}].map(option=><button type="button" key={option.value} className={tipChoice===option.value?"selected":""} aria-pressed={tipChoice===option.value} onClick={()=>setTipChoice(option.value)}><span aria-hidden="true">{option.emoji}</span><strong>{option.label}</strong></button>)}</div><input type="hidden" name="tipAmount" value={tipChoice==="custom"?customTipAmount:tipChoice}/>{tipChoice==="custom"&&<label className="bb-custom-tip">Your tip (BWP)<input name="customTipAmount" type="number" min="0.01" max="1000000" step="0.01" required value={customTipAmount} onChange={e=>setCustomTipAmount(e.target.value)} placeholder="Enter any amount"/></label>}<div className="bb-tip-summary"><div><span>Selected wash</span><strong>{selectedQueueService ? money(selectedQueueService.price) : serviceId === "customer-offer" ? "Price to agree" : "Choose a service"}</strong></div><div><span>Optional tip</span><strong>{money(customerTipValue)}</strong></div>{selectedQueueService&&typeof selectedQueueService.price==="number"&&<div className="bb-tip-total"><span>Wash + tip (if you choose to tip)</span><strong>{money(selectedQueueService.price + customerTipValue)}</strong></div>}</div><small className="field-hint">You and the team handle any transaction directly. The app does not collect or process this tip.</small></div>}</>}
      {tab==="fleet"&&<><label>Number of vehicles<input name="vehicleCount" type="number" min="1" max="10000" defaultValue="2" required/></label><label>Email (optional)<input name="email" type="email" maxLength={254} placeholder="you@company.com"/></label><label>Service needs<input name="fleetNeeds" maxLength={200} placeholder="e.g. regular cleaning"/></label><label>Preferred schedule<input name="preferredSchedule" maxLength={200} placeholder="Days / frequency"/></label><label>Preferred location<input name="preferredLocation" maxLength={200} defaultValue={locationName}/></label></>}
      <label className="full-field">Notes (optional)<textarea name="notes" maxLength={1000} rows={3} placeholder="Anything the team should know?"/></label></div>{connectionError && tab==="queue" && <p className="big-brothers-notice pending">The standard wash price list could not load. You can still propose an amount for the attendant to consider. The attendant must agree the final price with you before the wash starts. No price or payment is confirmed by this request.</p>}<button className="big-brothers-button primary submit-button" disabled={busy}>{busy?"Sending…":tab==="book"?"Send booking request":tab==="queue"?"Join the queue":"Send fleet enquiry"} ↗</button>{notice&&<p role="status" className={"big-brothers-notice "+notice.kind}>{notice.text}</p>}</form></div></section>
    <section className="big-brothers-section racing-section" id="big-brothers-racing" aria-label="Big Brothers Racing"><div className="racing-section-intro"><p className="big-brothers-eyebrow">A LITTLE EXTRA FOR THE FAMILY</p><h2>Got a laaitie who loves a challenge? 🏁</h2><p>Racing games aren’t everyone’s thing — and that’s cool. But if you enjoy a bit of competition, take the wheel while your ride gets its shine. Or send a young racer you know — your child, nephew, cousin or a game-loving friend — to give it a go.</p><p className="racing-reward-note"><strong>There could be more in it than a high score.</strong> We’re working towards special Big Brothers racing challenges where strong performances could give players a chance to win discounts on a future wash. You can play yourself or put a laaitie onto the challenge. Official rules, qualifying scores and available discounts will be announced when the competitions are ready — no discount is earned just by playing today.</p><a className="big-brothers-button primary" href="/games">Play or pass it to a laaitie ↗</a></div></section>
    <footer className="big-brothers-footer"><a href="#request" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><span>G-West, Gaborone · Wash. Care. Go.</span><a href="/account">My washes</a><a href="/games">Racing garage</a><a href="/iphone-install">Install on iPhone</a><a href="/admin">Staff sign in</a></footer>

    <aside className={"bb-help-widget"+(footerVisible?" is-footer-visible":"")} aria-label="Customer quick help">
      {chatOpen && (
        <section className="bb-help-panel" aria-labelledby="bb-help-title">
          <p className="big-brothers-eyebrow">QUICK HELP</p>
          <h2 id="bb-help-title">What do you need?</h2>
          <p>This guide opens real app pages and actions; it is not a live agent chat.</p>
          <a href="#request" onClick={() => setChatOpen(false)}>Join the walk-in queue ↗</a>
          <a href="/account" onClick={() => setChatOpen(false)}>My washes &amp; receipts ↗</a>
          <Link href="/?journey=book#request" onClick={() => setChatOpen(false)}>Book another wash ↗</Link>
          <a href="#big-brothers-racing" onClick={() => setChatOpen(false)}>Play Big Brothers Racing ↗</a>
          <a href="#big-brothers-racing" onClick={() => setChatOpen(false)}>Racing &amp; wash offers ↗</a>
        </section>
      )}
      <button type="button" className="bb-help-launcher" aria-expanded={chatOpen} onClick={() => setChatOpen(open => !open)}>
        <span aria-hidden="true">{chatOpen ? "×" : "?"}</span>
        {chatOpen ? "Close help" : "Need a hand?"}
      </button>
    </aside>

  </main>;
}
