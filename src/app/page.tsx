/* eslint-disable react/no-unescaped-entities, @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, hasFirebaseWebConfig } from "@/lib/firebase/client";
import { enableVulaPushNotifications } from "@/lib/firebase/big-brothers-notifications";
import { saveAnnouncementPreferences, saveReminderPreferences, subscribeLoyaltyAccount, subscribeReminderPreferences, subscribeServices, subscribeSettings, type VulaService } from "@/lib/firebase/big-brothers-data";
import "./big-brothers.css";
import RacingWarmup from "./games/racing-warmup";
import LocationWeather from "@/components/LocationWeather";

type Notice = { kind: "success" | "error" | "pending"; text: string };
const pendingKey = "big-brothers-car-wash:offline-requests:v1";
const stamp = () => new Date().toISOString();
const money = (price?: number) => typeof price === "number" ? "P" + price.toLocaleString("en-BW", { maximumFractionDigits: 2 }) : "Price confirmed by the team";

export default function Home() {
  const [services, setServices] = useState<VulaService[]>([]);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [online, setOnline] = useState(true);
  const [userId, setUserId] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueHandoff, setQueueHandoff] = useState<"synced" | "offline" | null>(null);
  const [queueReference, setQueueReference] = useState("");
  const [handoffError, setHandoffError] = useState("");
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
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [announcementsEnabled, setAnnouncementsEnabled] = useState(false);
  const [announcementNotice, setAnnouncementNotice] = useState("");
  const [reminderNotice, setReminderNotice] = useState("");
  const [pushNotice, setPushNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [footerVisible, setFooterVisible] = useState(false);
  const [inviteNotice, setInviteNotice] = useState("");
  const mobileCoverage = Array.isArray(settings.mobileCoverage) ? settings.mobileCoverage as string[] : [];
  const configuredBusinessName = typeof settings.businessName === "string" ? settings.businessName.trim() : "";
  const businessName = configuredBusinessName && !/car\s+a\s+wash|😎/i.test(configuredBusinessName) ? configuredBusinessName : "Big Brothers Car Wash";
  const locationName = typeof settings.locationName === "string" && settings.locationName.trim() ? settings.locationName : "G-West";
  const activeServices = useMemo(() => services.filter(s => s.active), [services]);

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
    const stopAuth = onAuthStateChanged(auth, user => { setUserId(user?.uid ?? ""); });
    const stops = [subscribeServices(setServices, error => setConnectionError(error.message)), subscribeSettings(value => setSettings(value ?? {}), () => {})];
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    if (navigator.onLine) void syncOfflineRequests();
    return () => { stopAuth(); stops.forEach(stop => stop()); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
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


  useEffect(() => {
    if (!userId) { setLoyaltyPoints(0); setRemindersEnabled(false); setAnnouncementsEnabled(false); return; }
    const fail = () => {};
    const stops = [
      subscribeLoyaltyAccount(userId, value => setLoyaltyPoints(Number(value?.pointsBalance ?? 0)), fail),
      subscribeReminderPreferences(userId, value => { setRemindersEnabled(Boolean(value?.enabled)); setAnnouncementsEnabled(Boolean(value?.announcementsEnabled)); }, fail),
    ];
    return () => stops.forEach(stop => stop());
  }, [userId]);

  async function saveReminderChoice() {
    if (!userId || !navigator.onLine) { setReminderNotice("Connect to the internet and submit a request first to save this preference."); return; }
    try { await saveReminderPreferences(userId, remindersEnabled); setReminderNotice("Your in-app reminder preference is saved. Push, SMS or email delivery still needs a notification channel to be configured."); }
    catch (error) { setReminderNotice(error instanceof Error ? error.message : "Reminder preference could not be saved."); }
  }

  async function enablePush() {
    if (!userId || !navigator.onLine) { setPushNotice("Connect and submit an online request first."); return; }
    try { await enableVulaPushNotifications(userId); await saveReminderPreferences(userId, true); setRemindersEnabled(true); setPushNotice("Push reminders are enabled on this device for confirmed bookings."); }
    catch (error) { setPushNotice(error instanceof Error ? error.message : "Push reminders could not be enabled."); }
  }
  async function enableAnnouncementPush() {
    if (!userId || !navigator.onLine) { setAnnouncementNotice("Submit an online request on your own device before enabling announcement alerts."); return; }
    try {
      await enableVulaPushNotifications(userId);
      await saveAnnouncementPreferences(userId, true);
      setAnnouncementsEnabled(true);
      setAnnouncementNotice("You're opted in. Big Brothers can send published offers to this device; you can switch this off any time.");
    } catch (error) { setAnnouncementNotice(error instanceof Error ? error.message : "Announcement alerts could not be enabled."); }
  }
  async function saveAnnouncementChoice() {
    if (!userId || !navigator.onLine) { setAnnouncementNotice("Connect and submit a request first to save this preference."); return; }
    try { await saveAnnouncementPreferences(userId, announcementsEnabled); setAnnouncementNotice(announcementsEnabled ? "Announcement preference saved. To receive push alerts on this device, enable notification permission." : "You have opted out of announcement alerts."); }
    catch (error) { setAnnouncementNotice(error instanceof Error ? error.message : "Preference could not be saved."); }
  }

  async function shareInvite() {
    const url = window.location.origin + "/";
    const message = "Join me at Big Brothers Car Wash to queue for a wash and play Big Brothers Racing: " + url;
    try {
      if (navigator.share) { await navigator.share({ title: "Big Brothers Car Wash", text: message, url }); setInviteNotice("Invite ready to share."); return; }
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(message); setInviteNotice("Invite link copied. Send it to friends or family."); return; }
      setInviteNotice("Share this link with friends and family: " + url);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setInviteNotice("Sharing is unavailable here. Copy this link to invite friends: " + url);
    }
  }

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
    let drafts: Array<{ id?: string; collection: string; data: Record<string, unknown> }> = [];
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
      if (queueDraft && !remaining.some(draft => draft.id === queueDraft.id)) { setQueueReference(queueDraft.id || ""); setQueueHandoff("synced"); }
    } catch { setNotice({ kind: "pending", text: "Sync is not complete. Your saved requests remain on this device." }); }
  }

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const customerName = String(form.get("customerName") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const vehicleType = String(form.get("vehicleType") ?? "").trim();
    const vehicleDescription = String(form.get("vehicleType") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const customerOfferRaw = String(form.get("customerOfferAmount") ?? "").trim();
    const customerOfferAmount = customerOfferRaw ? Number(customerOfferRaw) : null;
    const now = stamp();
    if (!customerName || !phone) { setNotice({ kind: "error", text: "Enter your name and WhatsApp number." }); return; }
    if (tab === "queue" && !serviceId) { setNotice({ kind: "error", text: "Choose a listed wash service or select “I’d like to propose my own price” to enter an amount for the attendant to consider." }); return; }
    setBusy(true); setNotice(null);
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
        if (serviceId === "customer-offer" && (customerOfferAmount === null || !Number.isFinite(customerOfferAmount) || customerOfferAmount <= 0 || customerOfferAmount > 1000000)) throw new Error("Enter a proposed amount greater than BWP 0 for the attendant to consider.");
        data = { ...common, email: String(form.get("email") ?? "").trim(), serviceId, serviceName: serviceId === "customer-offer" ? "Customer-proposed price (agree with attendant)" : selectedOffer!.name, ...(selectedOffer ? { servicePrice: selectedOffer.price } : {}), ...(customerOfferAmount !== null && Number.isFinite(customerOfferAmount) && customerOfferAmount >= 0 ? { customerOfferAmount } : {}), locationId: locationName, status: "waiting" };
      } else {
        collectionName = "fleetRequests";
        data = { businessName: String(form.get("businessName") ?? "").trim(), contactName: customerName, phone, email: String(form.get("email") ?? "").trim(), vehicleCount: Number(form.get("vehicleCount") || 1), vehicleTypes: [vehicleType], serviceNeeds: [String(form.get("fleetNeeds") || "Regular cleaning")], preferredLocation: String(form.get("preferredLocation") || locationName), preferredSchedule: String(form.get("preferredSchedule") ?? ""), notes, status: "new", createdAt: now, updatedAt: now };
        if (!data.businessName) throw new Error("Enter the business or fleet name.");
      }
      if (!navigator.onLine || !hasFirebaseWebConfig) {
        const saved = JSON.parse(localStorage.getItem(pendingKey) || "[]") as Array<unknown>;
        const localId = crypto.randomUUID(); saved.push({ id: localId, collection: collectionName, data }); localStorage.setItem(pendingKey, JSON.stringify(saved)); formElement.reset();
        if (tab === "queue") { setQueueReference(localId); setQueueHandoff("offline"); }
        setNotice({ kind: "pending", text: "Saved on this device only. It is not visible to the team or a confirmed booking until it syncs." }); return;
      }
      const user = await ensureUser();
      if (!user) throw new Error("Online service is not configured yet. Your request has not been sent.");
      await saveCustomerRecord(user.uid, customerName, phone, String(form.get("email") || user.email || ""));
      const requestRef = doc(collection(db, collectionName));
      const writePromise = setDoc(requestRef, { ...data, customerId: user.uid });
      setNotice({ kind: "pending", text: "Sending securely to Big Brothers' system…" });
      await writePromise;
      formElement.reset();
      if (tab === "queue") { setQueueReference(requestRef.id);  setQueueHandoff("synced"); }
      setNotice({ kind: "success", text: tab === "queue" ? "You’re on the shared queue. Staff can send your secure receipt and account link to this WhatsApp number after the wash is completed." : "Your booking request reached Big Brothers. The team will check availability and confirm it with you." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "We couldn't send this request. Please try again when connected." });
    } finally { setBusy(false); }
  }

  async function finishQueueHandoff() {
    setHandoffError("");
    try {
      await signOut(auth);
      setQueueHandoff(null);
      setQueueReference("");
      setNotice(null);
      setReminderNotice("");
      setPushNotice("");
      setLoyaltyPoints(0);
      setRemindersEnabled(false);
      setAnnouncementsEnabled(false);
      setServiceId("");
      setTab("queue");
    } catch {
      setHandoffError("This session could not be cleared. Keep this screen open and try again before handing the phone to another customer.");
    }
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
      {queueHandoff === "synced" ? <><p>Your entry has reached the shared staff queue. Staff will send your secure receipt and account link to the WhatsApp number you entered after the wash is completed. On that link, you can secure your account, book again, choose optional notifications, and share your freshly washed car.</p><p className="queue-reference">Queue reference <strong>{queueReference || "Recorded"}</strong></p><a className="big-brothers-button secondary" href="/games">Race while you wait ↗</a><button type="button" className="big-brothers-button primary" onClick={() => void finishQueueHandoff()}>Finish & hand back phone</button></> : <><p>This request is not yet in the shared queue. Keep this screen open until the phone reconnects and the server confirms the upload.</p><p className="queue-reference">Saved draft <strong>{queueReference || "On this device"}</strong></p><button type="button" className="big-brothers-button secondary" disabled={!online} onClick={() => void syncOfflineRequests()}>Retry sync</button><button type="button" className="big-brothers-button secondary" onClick={discardOfflineQueueDraft}>Discard saved request & clear session</button></>}
      {handoffError && <p role="alert" className="big-brothers-notice error">{handoffError}</p>}
    </section></main>;
  }

  return <main className="vula">
    <header className="big-brothers-nav"><a href="#request" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><nav><a href="/account" aria-label="My Big Brothers Car Wash Account">My BB CW Account</a><a href="#big-brothers-racing">Racing</a></nav><a className="big-brothers-cta" href="#request" onClick={() => setTab("queue")}>Join the queue ↗</a></header>
    <section className="big-brothers-section request-section" id="request"><div className="section-title"><p className="big-brothers-eyebrow">WALK-IN INTAKE</p><h2>{tab === "book" ? "Plan your next wash." : <>Join the<br/><em>walk-in queue.</em></>}</h2><p>{tab === "book" ? "Request a preferred date and time. The team will confirm availability with you." : "The attendant lends you this phone to join the queue. Staff will send your secure receipt and account link to your WhatsApp after the wash is completed."}</p><p className="big-brothers-notice pending">Already washed with us? Open <a href="/account">My BB CW Account</a> in the header to access your receipts and request your next wash — you do not need to join the walk-in queue again.</p></div><div className="request-panel">{tab === "book" && <div className="request-tabs"><strong>FUTURE WASH REQUEST</strong><button type="button" onClick={() => setTab("queue")}>Back to walk-in queue</button></div>}<form onSubmit={submitRequest} className="big-brothers-form"><div className="form-intro"><strong>{tab === "book" ? "Request your next wash" : "Customer details"}</strong><span>{tab === "book" ? "Choose a preferred date and time; the team will confirm availability." : "Your name and WhatsApp go to the shared staff queue. Car description and notes are optional."}</span></div>
      {tab==="book"&&<><div className="mode-switch"><button type="button" className={mode==="site"?"selected":""} onClick={()=>setMode("site")}>At the wash</button><button type="button" className={mode==="mobile"?"selected":""} onClick={()=>setMode("mobile")}>Mobile service</button></div>{mode==="mobile"&&<p className="coverage-note">{mobileCoverage.length?"Coverage will be checked against: "+mobileCoverage.join(", "):"Mobile coverage is not yet published. This is a request for review, not a confirmed mobile booking."}</p>}</>}
      {tab==="fleet"&&<label>Business / fleet name<input name="businessName" required maxLength={160} placeholder="Business name"/></label>}
      <div className="form-grid"><label>Your name<input name="customerName" required maxLength={120} autoComplete="name" placeholder="Full name"/></label><label>WhatsApp number<input name="phone" inputMode="tel" required maxLength={40} autoComplete="tel" placeholder="+267 …"/></label><p className="field-hint full-field">Staff can use this number to share your completed-wash receipt and secure account link on WhatsApp. This form does not send an automatic message.</p>{tab==="queue"&&<label>Email (optional)<input name="email" type="email" maxLength={254} autoComplete="email" placeholder="For your receipt link"/></label>}<label>Describe your car (optional)<input name="vehicleType" maxLength={80} placeholder="e.g. silver SUV, blue hatchback"/></label>
      {tab==="book"&&<><label>Service<select value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="">General car wash request</option>{activeServices.filter(s=>typeof s.price==="number"&&s.price>=0).map(s=><option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}</select></label><label>Preferred date<input type="date" name="preferredDate" min={new Date().toISOString().slice(0,10)} value={bookingDate} onChange={e=>setBookingDate(e.target.value)} required/></label><label>Preferred time{availabilityConfigured===true?<select name="preferredTime" value={bookingTime} onChange={e=>setBookingTime(e.target.value)} required disabled={availabilityLoading||availableSlots.length===0}><option value="">{availabilityLoading?"Checking times…":availableSlots.length?"Choose an available time":"No times available"}</option>{availableSlots.map(time=><option key={time} value={time}>{time}</option>)}</select>:<input type="time" name="preferredTime" min={typeof settings.openingTime==="string"&&settings.openingTime?settings.openingTime:undefined} max={typeof settings.closingTime==="string"&&settings.closingTime?settings.closingTime:undefined} step={1800} value={bookingTime} onChange={e=>setBookingTime(e.target.value)} required/>}<small>{availabilityMessage||"Choose a preferred time; staff will confirm availability."}</small></label><input type="hidden" name="scheduledFor" value={bookingDate && bookingTime ? `${bookingDate}T${bookingTime}` : ""}/><label>Area / address<input name="address" maxLength={500} required={mode==="mobile"} placeholder={mode==="mobile"?"Area, street or landmark":"Optional site note"}/></label><label>Payment preference<select name="paymentMethod" defaultValue="pay-on-site"><option value="pay-on-site">Pay at the wash / on completion</option><option value="online-payment-request">Request online payment instructions</option></select></label></>}
      {tab==="queue"&&<><label>Service &amp; price<select value={serviceId} onChange={e=>setServiceId(e.target.value)} required><option value="">Choose a service or propose an amount</option>{activeServices.filter(s=>typeof s.price==="number"&&s.price>=0).map(s=><option key={s.id} value={s.id}>{s.name} · {money(s.price)}</option>)}<option value="customer-offer">I’d like to propose my own price</option></select></label>{serviceId==="customer-offer"&&<label>Your proposed amount (BWP)<input name="customerOfferAmount" type="number" min="0" max="1000000" step="0.01" required placeholder="e.g. 80"/><small>This is a proposal only. The attendant and you agree the final price before payment.</small></label>}</>}
      {tab==="fleet"&&<><label>Number of vehicles<input name="vehicleCount" type="number" min="1" max="10000" defaultValue="2" required/></label><label>Email (optional)<input name="email" type="email" maxLength={254} placeholder="you@company.com"/></label><label>Service needs<input name="fleetNeeds" maxLength={200} placeholder="e.g. regular cleaning"/></label><label>Preferred schedule<input name="preferredSchedule" maxLength={200} placeholder="Days / frequency"/></label><label>Preferred location<input name="preferredLocation" maxLength={200} defaultValue={locationName}/></label></>}
      <label className="full-field">Notes (optional)<textarea name="notes" maxLength={1000} rows={3} placeholder="Anything the team should know?"/></label></div>{connectionError && tab==="queue" && <p className="big-brothers-notice pending">The standard wash price list could not load. You can still choose “I’d like to propose my own price” and enter the amount you want the attendant to consider. The attendant must agree the final price with you before the wash starts. No price or payment is confirmed by this request.</p>}<button className="big-brothers-button primary submit-button" disabled={busy}>{busy?"Sending…":tab==="book"?"Send booking request":tab==="queue"?"Join the queue":"Send fleet enquiry"} ↗</button>{notice&&<p role="status" className={"big-brothers-notice "+notice.kind}>{notice.text}</p>}</form></div></section>
    <section className="big-brothers-section account-section" id="my-account">
      <div className="section-title account-section-heading"><p className="big-brothers-eyebrow">YOUR CUSTOMER ACCOUNT</p><h2>My Big Brothers Car Wash Account.</h2><p>Your completed-wash receipt and secure account link can be sent to your WhatsApp by staff. Open your account to manage your details, receipts, bookings and reminders.</p><div className="account-portal-actions"><a href="/account" className="big-brothers-button primary">My account & receipts ↗</a><Link href="/?journey=book#request" className="big-brothers-button secondary">Book my next wash ↗</Link><button type="button" className="big-brothers-button secondary" onClick={shareInvite}>Invite friends & family ↗</button></div>{inviteNotice && <p role="status" className="big-brothers-notice pending">{inviteNotice}</p>}</div>
      <div className="account-grid account-grid-home">
        <article className="account-card loyalty-card"><span className="service-category">LOYALTY BALANCE</span><strong className="loyalty-points">{loyaltyPoints}</strong><span>points</span><p>Points are maintained by Big Brothers staff. Automatic points and discounts are not active until the business confirms the rules.</p><a className="text-link" href="/account">View my account details ↗</a></article>
        <article className="account-card account-weather-card"><div className="account-card-heading"><span className="service-category">G-WEST WEATHER</span><p>Current conditions are a guide, not a promise about service availability.</p></div><div className="account-weather"><LocationWeather showLocationGuide={false}/></div></article>
        <article className="account-card account-reminders-card"><span className="service-category">STAY IN THE LOOP</span><h3>Booking reminders</h3><p>Choose an in-app reminder preference or enable push alerts on this device. Push needs browser permission and the configured Firebase Web Push key.</p><label className="reminder-toggle"><input type="checkbox" checked={remindersEnabled} onChange={e=>setRemindersEnabled(e.target.checked)}/> In-app booking reminders</label><button type="button" className="big-brothers-button secondary" onClick={()=>void saveReminderChoice()} disabled={!userId || !online}>Save preference</button><button type="button" className="big-brothers-button primary" onClick={()=>void enablePush()} disabled={!userId || !online}>Enable push reminders</button><p className="reminder-disclaimer">Only upcoming confirmed bookings are eligible for configured push reminders. Permission or a saved preference alone does not confirm delivery.</p>{reminderNotice&&<p className="big-brothers-notice pending">{reminderNotice}</p>}{pushNotice&&<p className="big-brothers-notice pending">{pushNotice}</p>}</article>
        <article className="account-card account-announcements-card"><span className="service-category">NEWS & SPECIAL OFFERS</span><h3>{String(settings.announcementTitle||"Big Brothers updates")}</h3><p>{String(settings.announcementMessage||"Opt in if you would like to hear about special wash offers and news published by the team.")}</p><label className="reminder-toggle"><input type="checkbox" checked={announcementsEnabled} onChange={e=>setAnnouncementsEnabled(e.target.checked)}/> I’d like news and special-offer alerts</label><button type="button" className="big-brothers-button secondary" disabled={!userId||!online} onClick={()=>void saveAnnouncementChoice()}>Save preference</button><button type="button" className="big-brothers-button primary" disabled={!userId||!online} onClick={()=>void enableAnnouncementPush()}>Enable offer notifications</button>{announcementNotice&&<p role="status" className="big-brothers-notice pending">{announcementNotice}</p>}</article>
      </div>
    </section>
    <section className="big-brothers-section racing-section" id="big-brothers-racing" aria-label="Big Brothers Racing"><div className="racing-section-intro"><p className="big-brothers-eyebrow">WHILE YOUR WASH IS GETTING READY</p><h2>Big Brothers Racing.</h2><p>Take a quick solo race, chase your personal best, and invite family or friends to try the track.</p><p className="racing-reward-note"><strong>High-score discounts are coming soon.</strong> Game scores do not earn or redeem discounts yet.</p></div><RacingWarmup embedded /></section>
    <footer className="big-brothers-footer"><a href="#request" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><span>G-West, Gaborone · Wash. Care. Go.</span><a href="/account">My account</a><a href="/games">Racing garage</a><a href="/iphone-install">Install on iPhone</a><a href="/admin">Staff sign in</a></footer>

    <aside className={"bb-help-widget"+(footerVisible?" is-footer-visible":"")} aria-label="Customer quick help">
      {chatOpen && (
        <section className="bb-help-panel" aria-labelledby="bb-help-title">
          <p className="big-brothers-eyebrow">QUICK HELP</p>
          <h2 id="bb-help-title">What do you need?</h2>
          <p>This guide opens real app pages and actions; it is not a live agent chat.</p>
          <a href="#request" onClick={() => setChatOpen(false)}>Join the walk-in queue ↗</a>
          <a href="/account" onClick={() => setChatOpen(false)}>My account &amp; receipts ↗</a>
          <Link href="/?journey=book#request" onClick={() => setChatOpen(false)}>Book another wash ↗</Link>
          <a href="#big-brothers-racing" onClick={() => setChatOpen(false)}>Play Big Brothers Racing ↗</a>
          <a href="#my-account" onClick={() => setChatOpen(false)}>Weather &amp; reminders ↗</a>
        </section>
      )}
      <button type="button" className="bb-help-launcher" aria-expanded={chatOpen} onClick={() => setChatOpen(open => !open)}>
        <span aria-hidden="true">{chatOpen ? "×" : "?"}</span>
        {chatOpen ? "Close help" : "Need a hand?"}
      </button>
    </aside>

  </main>;
}
