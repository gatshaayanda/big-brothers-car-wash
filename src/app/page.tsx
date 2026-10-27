/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useMemo, useState } from "react";
import { GoogleAuthProvider, linkWithPopup, onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, hasFirebaseWebConfig } from "@/lib/firebase/client";
import { enableVulaPushNotifications } from "@/lib/firebase/big-brothers-notifications";
import { saveReminderPreferences, subscribeCustomerBookings, subscribeCustomerQueue, subscribeLoyaltyAccount, subscribeReminderPreferences, subscribeServices, subscribeSettings, type VulaBooking, type VulaQueueEntry, type VulaService } from "@/lib/firebase/big-brothers-data";
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
  const [isGuest, setIsGuest] = useState(true);
  const [linkNotice, setLinkNotice] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [queueHandoff, setQueueHandoff] = useState<"synced" | "offline" | null>(null);
  const [queueReference, setQueueReference] = useState("");
  const [handoffError, setHandoffError] = useState("");
  const [mode, setMode] = useState<"site" | "mobile">("site");
  const [serviceId, setServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [tab, setTab] = useState<"book" | "queue" | "fleet">("queue");
  const [repeatPrefill, setRepeatPrefill] = useState<{customerName?:string;phone?:string;vehicleType?:string;vehicleRegistration?:string}|null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [myBookings, setMyBookings] = useState<VulaBooking[]>([]);
  const [myQueueEntries, setMyQueueEntries] = useState<VulaQueueEntry[]>([]);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderNotice, setReminderNotice] = useState("");
  const [pushNotice, setPushNotice] = useState("");
  const mobileCoverage = Array.isArray(settings.mobileCoverage) ? settings.mobileCoverage as string[] : [];
  const businessName = typeof settings.businessName === "string" && settings.businessName.trim() ? settings.businessName : "Big Brothers Car Wash";
  const locationName = typeof settings.locationName === "string" && settings.locationName.trim() ? settings.locationName : "G-West";
  const activeServices = useMemo(() => services.filter(s => s.active), [services]);
  const upcomingBookings = myBookings.filter(item => !["completed","cancelled"].includes(item.status) && Number.isFinite(Date.parse(item.scheduledFor)) && Date.parse(item.scheduledFor) >= Date.now() && Date.parse(item.scheduledFor) - Date.now() <= 24 * 60 * 60 * 1000);

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
    setOnline(navigator.onLine);
    const onOnline = () => { setOnline(true); void syncOfflineRequests(); };
    const onOffline = () => { setOnline(false); setNotice({ kind: "pending", text: "Offline: requests can be saved on this device, but the team cannot see them until they sync." }); };
    const stopAuth = onAuthStateChanged(auth, user => { setUserId(user?.uid ?? ""); setIsGuest(user?.isAnonymous ?? true); });
    const stops = [subscribeServices(setServices, error => setConnectionError(error.message)), subscribeSettings(value => setSettings(value ?? {}), () => {})];
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    if (navigator.onLine) void syncOfflineRequests();
    return () => { stopAuth(); stops.forEach(stop => stop()); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("journey") === "book") setTab("book"); }, []);

  useEffect(() => {
    if (!userId) { setMyBookings([]); setMyQueueEntries([]); setLoyaltyPoints(0); setRemindersEnabled(false); return; }
    const fail = () => {};
    const stops = [
      subscribeCustomerBookings(userId, setMyBookings, fail),
      subscribeCustomerQueue(userId, setMyQueueEntries, fail),
      subscribeLoyaltyAccount(userId, value => setLoyaltyPoints(Number(value?.pointsBalance ?? 0)), fail),
      subscribeReminderPreferences(userId, value => setRemindersEnabled(Boolean(value?.enabled)), fail),
    ];
    return () => stops.forEach(stop => stop());
  }, [userId]);

  async function linkGuestAccount() {
    const user = auth.currentUser;
    if (!user || !user.isAnonymous) { setLinkNotice("This session is already linked to a sign-in method."); return; }
    try {
      await linkWithPopup(user, new GoogleAuthProvider());
      setIsGuest(false);
      setLinkNotice("Your guest session is now linked to Google. Your Big Brothers customer ID and loyalty balance stay with this account on supported devices.");
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as {code?:unknown}).code) : "";
      setLinkNotice(code === "auth/credential-already-in-use" ? "That Google account is already linked to another Firebase account. Staff will need to help reconcile existing loyalty records." : error instanceof Error ? error.message : "We could not link this session. Try again while online.");
    }
  }

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
    const vehicleRegistration = String(form.get("vehicleRegistration") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const now = stamp();
    if (!customerName || !phone || !vehicleType) { setNotice({ kind: "error", text: "Enter your name, phone number and vehicle type." }); return; }
    setBusy(true); setNotice(null);
    try {
      const common: Record<string, unknown> = { customerName, phone, vehicleType, vehicleRegistration, notes, createdAt: now, updatedAt: now };
      let collectionName: string; let data: Record<string, unknown>;
      if (tab === "book") {
        const address = String(form.get("address") ?? "").trim(); const scheduledInput = String(form.get("scheduledFor") ?? "");
        if (mode === "mobile" && !address) throw new Error("Enter the area or address for the mobile coverage check.");
        if (!scheduledInput) throw new Error("Choose your preferred date and time.");
        const scheduledDate = new Date(scheduledInput);
        if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) throw new Error("Choose a future date and time.");
        const scheduledFor = scheduledDate.toISOString();
        collectionName = "bookings";
        data = { ...common, serviceId: serviceId || "general-request", serviceName: activeServices.find(s => s.id === serviceId)?.name || "General car wash request", serviceMode: mode, locationId: mode === "site" ? locationName : "coverage-review", address, scheduledFor, paymentMethod: String(form.get("paymentMethod") || "pay-on-site"), paymentStatus: "unpaid", status: "requested" };
      } else if (tab === "queue") {
        collectionName = "queueEntries";
        data = { ...common, serviceId: serviceId || "walk-in", serviceName: activeServices.find(s => s.id === serviceId)?.name || "Walk-in service", locationId: locationName, status: "waiting" };
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
      if (tab === "queue") { setQueueReference(requestRef.id); setQueueHandoff("synced"); }
      setNotice({ kind: "success", text: "Request received by Big Brothers' system. Staff still need to confirm the booking, mobile coverage or fleet arrangement." });
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
      setLinkNotice("");
      setReminderNotice("");
      setPushNotice("");
      setMyBookings([]);
      setMyQueueEntries([]);
      setLoyaltyPoints(0);
      setRemindersEnabled(false);
      setIsGuest(true);
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
      {queueHandoff === "synced" ? <><p>Your entry has reached the shared queue. Staff can now see it and update its status.</p><p className="queue-reference">Queue reference <strong>{queueReference || "Recorded"}</strong></p><p>Want to check this job and your future bookings later? Secure this guest session with Google before you finish.</p><button type="button" className="big-brothers-button secondary" onClick={() => void linkGuestAccount()}>Keep my history with Google</button>{linkNotice && <p role="status" className="big-brothers-notice pending">{linkNotice}</p>}<button type="button" className="big-brothers-button primary" onClick={() => void finishQueueHandoff()}>Finish & hand back phone</button></> : <><p>This request is not yet in the shared queue. Keep this screen open until the phone reconnects and the server confirms the upload.</p><p className="queue-reference">Saved draft <strong>{queueReference || "On this device"}</strong></p><button type="button" className="big-brothers-button secondary" disabled={!online} onClick={() => void syncOfflineRequests()}>Retry sync</button><button type="button" className="big-brothers-button secondary" onClick={discardOfflineQueueDraft}>Discard saved request & clear session</button></>}
      {handoffError && <p role="alert" className="big-brothers-notice error">{handoffError}</p>}
    </section></main>;
  }

  return <main className="vula">
    <div className="big-brothers-status"><span className={"status-dot " + (online ? "online" : "")}/>{online ? "Connected" : "Offline mode"} <span>·</span> {online ? "Requests sync with the team" : "Saved requests wait on this device"}</div>
    <header className="big-brothers-nav"><a href="#top" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><nav><a href="#services">Services</a><a href="#locations">Locations</a><a href="/account">My account</a></nav><a className="big-brothers-cta" href="#request">Book a wash ↗</a></header>
    <section className="big-brothers-hero" id="top"><div className="big-brothers-hero-copy"><p className="big-brothers-eyebrow">CAR CARE, MADE SIMPLE</p><h1>A cleaner car.<br/><em>One less thing.</em></h1><p>Book at the wash, request mobile service, or join the walk-in queue. The team sees your request once it syncs—and confirms it before it's booked.</p><div className="big-brothers-actions"><a className="big-brothers-button primary" href="#request" onClick={() => setTab("queue")}>Join the walk-in queue ↗</a><a className="big-brothers-button secondary" href="#services">View services</a></div><div className="big-brothers-trust"><span>✓ Live request sync</span><span>✓ Offline-aware</span><span>✓ Guest booking</span></div></div><div className="big-brothers-hero-art"><div className="car-illustration"><div className="car-roof"/><div className="car-body"/><div className="car-window one"/><div className="car-window two"/><div className="car-wheel left"/><div className="car-wheel right"/><span className="shine shine-one">✦</span><span className="shine shine-two">✦</span></div><div className="hero-caption"><span>VULA / CAR CARE</span><strong>Ready when you are.</strong></div></div></section>
    <LocationWeather />
    <section className="big-brothers-section" id="services"><div className="section-title"><p className="big-brothers-eyebrow">THE SERVICE MENU</p><h2>Pick your clean.</h2><p>Services and prices are managed by the team. No unverified prices are assumed.</p></div><div className="big-brothers-services">{activeServices.length ? activeServices.map(service=><article className="service-card" key={service.id}><span className="service-category">{service.category || "CAR WASH"}</span><h3>{service.name}</h3><p>{service.description || "Ask the team about this service."}</p><div className="service-card-bottom"><strong>{money(service.price)}</strong><button type="button" onClick={()=>{setServiceId(service.id);setTab("book");document.getElementById("request")?.scrollIntoView({behavior:"smooth"});}}>Choose service ↗</button></div></article>) : <article className="service-empty"><span>01 / SERVICES</span><h3>Service menu is being set up.</h3><p>Send a general request now. Staff can publish confirmed services and prices from the dashboard.</p><a href="#request" className="text-link">Request a wash ↗</a></article>}</div>{connectionError&&<p className="big-brothers-notice pending">Live catalogue unavailable: {connectionError}</p>}</section>
    <section className="big-brothers-section locations-section" id="locations"><div className="section-title"><p className="big-brothers-eyebrow">COME THROUGH OR CALL US OUT</p><h2>Two ways to get clean.</h2></div><div className="location-cards"><article><span className="location-number">01</span><h3>Visit the wash</h3><p>{locationName} · {String(settings.address || "Exact address to be confirmed")} · {String(settings.openingHours || "Opening hours to be confirmed")}</p><a href="#request" onClick={()=>setMode("site")} className="text-link">Book at the wash ↗</a></article><article><span className="location-number">02</span><h3>Mobile service</h3><p>{mobileCoverage.length ? "Published coverage: " + mobileCoverage.join(", ") : "Coverage has not yet been confirmed. Send an area request and staff will check before accepting."}</p><a href="#request" onClick={()=>setMode("mobile")} className="text-link">Check my area ↗</a></article></div></section>
    <section className="big-brothers-section request-section" id="request"><div className="section-title"><p className="big-brothers-eyebrow">START HERE</p><h2>Start with the queue.</h2><p>Join the walk-in queue first. You can request a future booking or fleet care whenever you need it.</p><p className="big-brothers-notice pending">A request is not a confirmed appointment. Staff confirmation is required.</p></div><div className="request-panel"><div className="request-tabs">{(["queue","book","fleet"] as const).map(value=><button type="button" key={value} className={tab===value?"active":""} onClick={()=>setTab(value)}>{value==="book"?"Book a wash":value==="queue"?"Walk-in queue":"Fleet care"}</button>)}</div><form onSubmit={submitRequest} className="big-brothers-form"><div className="form-intro"><strong>{tab==="book"?"Request a booking":tab==="queue"?"Join the walk-in queue":"Fleet and business enquiries"}</strong><span>{tab==="book"?"Staff check and confirm your preferred slot.":tab==="queue"?"Staff manage queue order and wait times.":"Tell us what your vehicles need."}</span></div>
      {tab==="book"&&<><div className="mode-switch"><button type="button" className={mode==="site"?"selected":""} onClick={()=>setMode("site")}>At the wash</button><button type="button" className={mode==="mobile"?"selected":""} onClick={()=>setMode("mobile")}>Mobile service</button></div>{mode==="mobile"&&<p className="coverage-note">{mobileCoverage.length?"Coverage will be checked against: "+mobileCoverage.join(", "):"Mobile coverage is not yet published. This is a request for review, not a confirmed mobile booking."}</p>}</>}
      {tab==="fleet"&&<label>Business / fleet name<input name="businessName" required maxLength={160} placeholder="Business name"/></label>}
      <div className="form-grid"><label>Your name<input name="customerName" required maxLength={120} autoComplete="name" placeholder="Full name"/></label><label>Phone number<input name="phone" required maxLength={40} autoComplete="tel" placeholder="Phone number"/></label><label>Vehicle type<input name="vehicleType" required maxLength={80} placeholder="Sedan, SUV, bakkie…"/></label><label>Registration (optional)<input name="vehicleRegistration" maxLength={30} placeholder="Vehicle registration"/></label>
      {tab==="book"&&<><label>Service<select value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="">General car wash request</option>{activeServices.map(s=><option key={s.id} value={s.id}>{s.name}{typeof s.price==="number"?" · "+money(s.price):""}</option>)}</select></label><label className="full-field">Preferred date and time<input type="hidden" name="scheduledFor" value={bookingDate && bookingTime ? `${bookingDate}T${bookingTime}` : ""}/><button type="button" className={"time-picker-trigger " + (bookingDate && bookingTime ? "has-selection" : "")} onClick={()=>setTimePickerOpen(true)} aria-haspopup="dialog" aria-expanded={timePickerOpen}>{bookingDate && bookingTime ? new Date(`${bookingDate}T${bookingTime}`).toLocaleString("en-BW",{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}) : "Choose a date and time"} <span aria-hidden="true">↗</span></button></label><label>Area / address<input name="address" maxLength={500} required={mode==="mobile"} placeholder={mode==="mobile"?"Area, street or landmark":"Optional site note"}/></label><label>Payment preference<select name="paymentMethod" defaultValue="pay-on-site"><option value="pay-on-site">Pay at the wash / on completion</option><option value="online-payment-request">Request online payment instructions</option></select></label></>}
      {tab==="queue"&&<label>Service<select value={serviceId} onChange={e=>setServiceId(e.target.value)}><option value="">General walk-in service</option>{activeServices.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {tab==="fleet"&&<><label>Number of vehicles<input name="vehicleCount" type="number" min="1" max="10000" defaultValue="2" required/></label><label>Email (optional)<input name="email" type="email" maxLength={254} placeholder="you@company.com"/></label><label>Service needs<input name="fleetNeeds" maxLength={200} placeholder="e.g. regular cleaning"/></label><label>Preferred schedule<input name="preferredSchedule" maxLength={200} placeholder="Days / frequency"/></label><label>Preferred location<input name="preferredLocation" maxLength={200} defaultValue={locationName}/></label></>}
      <label className="full-field">Notes (optional)<textarea name="notes" maxLength={1000} rows={3} placeholder="Anything the team should know?"/></label></div><button className="big-brothers-button primary submit-button" disabled={busy}>{busy?"Sending…":tab==="book"?"Send booking request":tab==="queue"?"Join the queue":"Send fleet enquiry"} ↗</button>{notice&&<p role="status" className={"big-brothers-notice "+notice.kind}>{notice.text}</p>}</form></div></section>
    
    <section className="big-brothers-section racing-section" id="big-brothers-racing" aria-label="Big Brothers Racing"><RacingWarmup embedded /></section>
    <section className="big-brothers-section account-section" id="my-wash"><div className="section-title"><p className="big-brothers-eyebrow">YOUR WASH SPACE</p><h2>My requests & loyalty.</h2><p>Booking updates are shared live when online. Points are maintained by staff using the business's confirmed loyalty policy.</p></div><div className="account-grid"><article className="account-card loyalty-card"><span className="service-category">LOYALTY BALANCE</span><strong className="loyalty-points">{loyaltyPoints}</strong><span>points</span><p>Points are not automatically awarded until Big Brothers confirms the earning rules. Keep this guest session on the same device, or show staff this session ID when asking about points.</p><small className="customer-uid">{isGuest?"Guest session ID":"Customer account ID"}: {userId || "Created after your first online request"}</small>{userId&&isGuest&&<button type="button" className="big-brothers-button secondary" onClick={()=>void linkGuestAccount()}>Keep my loyalty with Google</button>}{linkNotice&&<p className="big-brothers-notice pending">{linkNotice}</p>}<label className="reminder-toggle"><input type="checkbox" checked={remindersEnabled} onChange={e=>setRemindersEnabled(e.target.checked)}/> Save in-app booking reminder preference</label><button type="button" className="big-brothers-button secondary" onClick={()=>void saveReminderChoice()} disabled={!userId || !online}>Save preference</button><button type="button" className="big-brothers-button primary" onClick={()=>void enablePush()} disabled={!userId || !online}>Enable push reminders</button><p className="reminder-disclaimer">Push alerts require browser permission and the Firebase Web Push key. Confirmed bookings are checked every five minutes; only upcoming confirmed bookings are sent.</p>{reminderNotice&&<p className="big-brothers-notice pending">{reminderNotice}</p>}{pushNotice&&<p className="big-brothers-notice pending">{pushNotice}</p>}</article><article className="account-card"><span className="service-category">MY BOOKINGS</span>{upcomingBookings.length>0&&<div className="upcoming-reminder"><strong>Upcoming in the next 24 hours</strong>{upcomingBookings.map(item=><p key={item.id}>{item.serviceName} · {new Date(item.scheduledFor).toLocaleString()}</p>)}</div>}{myBookings.length?myBookings.slice(0,5).map(item=><div className="customer-booking" key={item.id}><strong>{item.serviceName}</strong><span>{item.status} · {item.scheduledFor||"Time to be agreed"}</span><small>{item.serviceMode==="mobile"?"Mobile request":"At the wash"} · {item.phone}</small></div>):<p className="account-empty">{userId?"No booking requests are linked to this guest session yet.":"Your requests will appear here after you submit your first online request."}</p>}</article><article className="account-card"><span className="service-category">MY WALK-IN QUEUE</span>{myQueueEntries.length ? myQueueEntries.slice(0,5).map(item=><div className="customer-booking" key={item.id}><strong>{item.serviceName}</strong><span>{item.status} · Joined {item.createdAt ? new Date(item.createdAt).toLocaleString() : "time unavailable"}</span><small>{item.vehicleType}{item.vehicleRegistration ? " · " + item.vehicleRegistration : ""}</small></div>) : <p className="account-empty">{userId ? "No walk-in queue entries are linked to this guest session yet." : "Your queue history will appear here after you join online."}</p>}</article></div><article className="account-card race-promo"><span className="service-category">BIG BROTHERS RACING</span><h3>Take the long way home.</h3><p>Build your racer, master 12 tracks and race Kago and Neo for virtual credits. Your racing career is separate from bookings and loyalty.</p><a className="big-brothers-button primary" href="/games">Enter racing garage ↗</a><small>Online career progress syncs to your account. Offline-only results remain on this device.</small></article></section>
    <section className="big-brothers-bottom"><p className="big-brothers-eyebrow">READY WHEN YOU ARE</p><h2>Your car called.</h2><p>Let's get it clean. Every booking is confirmed by the team.</p><a href="#request" className="big-brothers-button primary" onClick={() => setTab("queue")}>Join the walk-in queue ↗</a></section>
    <footer className="big-brothers-footer"><a href="#top" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><span>{userId ? "Customer session active" : "Customer session"} · Shared when synced</span><a href="/account">My account</a><a href="/games">Racing garage</a><a href="/iphone-install">Install on iPhone</a><a href="/admin">Staff sign in</a></footer>
    {timePickerOpen && <div className="time-picker-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setTimePickerOpen(false);}}><section className="time-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="time-picker-title"><button type="button" className="time-picker-close" aria-label="Close date and time picker" onClick={()=>setTimePickerOpen(false)}>×</button><p className="big-brothers-eyebrow">BOOK A WASH</p><h2 id="time-picker-title">Choose a time.</h2><p className="time-picker-intro">Pick your preferred date and time. The team will confirm the booking request.</p><label>Date<input type="date" min={new Date().toISOString().slice(0,10)} value={bookingDate} onChange={event=>setBookingDate(event.target.value)}/></label><div className="time-picker-label">Preferred time</div><div className="time-picker-slots">{Array.from({length:19},(_,i)=>{const minutes=8*60+i*30;const hour=Math.floor(minutes/60);const minute=minutes%60;const value=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;return <button type="button" key={value} className={bookingTime===value?"selected":""} onClick={()=>setBookingTime(value)}>{new Date(2000,0,1,hour,minute).toLocaleTimeString("en-BW",{hour:"numeric",minute:"2-digit"})}</button>})}</div><p className="time-picker-footnote">Preferred slots are requests, not confirmed availability.</p><button type="button" className="big-brothers-button primary time-picker-confirm" disabled={!bookingDate||!bookingTime||new Date(`${bookingDate}T${bookingTime}`).getTime()<=Date.now()} onClick={()=>setTimePickerOpen(false)}>Use this time ↗</button></section></div>}
  </main>;
}
