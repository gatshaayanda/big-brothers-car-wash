/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously, signOut } from "firebase/auth";
import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db, hasFirebaseWebConfig } from "@/lib/firebase/client";
import { enableVulaPushNotifications } from "@/lib/firebase/big-brothers-notifications";
import { saveReminderPreferences, subscribeLoyaltyAccount, subscribeReminderPreferences, subscribeServices, subscribeSettings, type VulaService } from "@/lib/firebase/big-brothers-data";
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
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [tab, setTab] = useState<"book" | "queue" | "fleet">("queue");
  const [repeatPrefill, setRepeatPrefill] = useState<{customerName?:string;phone?:string;vehicleType?:string;vehicleRegistration?:string}|null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderNotice, setReminderNotice] = useState("");
  const [pushNotice, setPushNotice] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [inviteNotice, setInviteNotice] = useState("");
  const mobileCoverage = Array.isArray(settings.mobileCoverage) ? settings.mobileCoverage as string[] : [];
  const businessName = typeof settings.businessName === "string" && settings.businessName.trim() ? settings.businessName : "Big Brothers Car Wash";
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
    setOnline(navigator.onLine);
    const onOnline = () => { setOnline(true); void syncOfflineRequests(); };
    const onOffline = () => { setOnline(false); setNotice({ kind: "pending", text: "Offline: requests can be saved on this device, but the team cannot see them until they sync." }); };
    const stopAuth = onAuthStateChanged(auth, user => { setUserId(user?.uid ?? ""); });
    const stops = [subscribeServices(setServices, error => setConnectionError(error.message)), subscribeSettings(value => setSettings(value ?? {}), () => {})];
    window.addEventListener("online", onOnline); window.addEventListener("offline", onOffline);
    if (navigator.onLine) void syncOfflineRequests();
    return () => { stopAuth(); stops.forEach(stop => stop()); window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => { if (new URLSearchParams(window.location.search).get("journey") === "book") setTab("book"); }, []);

  useEffect(() => {
    if (!userId) { setLoyaltyPoints(0); setRemindersEnabled(false); return; }
    const fail = () => {};
    const stops = [
      subscribeLoyaltyAccount(userId, value => setLoyaltyPoints(Number(value?.pointsBalance ?? 0)), fail),
      subscribeReminderPreferences(userId, value => setRemindersEnabled(Boolean(value?.enabled)), fail),
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
      {queueHandoff === "synced" ? <><p>Your entry has reached the shared queue. Staff can now see it and update its status.</p><p className="queue-reference">Queue reference <strong>{queueReference || "Recorded"}</strong></p><p>After the wash is completed, staff can send your receipt and account link to this WhatsApp number. You do not need to create an account on the wash attendant’s phone.</p><a className="big-brothers-button primary" href="/games">Race while you wait ↗</a><button type="button" className="big-brothers-button secondary" onClick={() => void finishQueueHandoff()}>Finish & hand back phone</button></> : <><p>This request is not yet in the shared queue. Keep this screen open until the phone reconnects and the server confirms the upload.</p><p className="queue-reference">Saved draft <strong>{queueReference || "On this device"}</strong></p><button type="button" className="big-brothers-button secondary" disabled={!online} onClick={() => void syncOfflineRequests()}>Retry sync</button><button type="button" className="big-brothers-button secondary" onClick={discardOfflineQueueDraft}>Discard saved request & clear session</button></>}
      {handoffError && <p role="alert" className="big-brothers-notice error">{handoffError}</p>}
    </section></main>;
  }

  return <main className="vula">
    <div className="big-brothers-status"><span className={"status-dot " + (online ? "online" : "")}/>{online ? "Online · Ready to help" : "Offline · Requests stay on this device until confirmed"}</div>
    <header className="big-brothers-nav"><a href="#request" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><nav><a href="/account">My account</a><a href="#big-brothers-racing">Racing</a></nav><a className="big-brothers-cta" href="#request" onClick={() => setTab("queue")}>Join the queue ↗</a></header>
    <section className="big-brothers-section request-section" id="request"><div className="section-title"><p className="big-brothers-eyebrow">WALK-IN INTAKE</p><h2>{tab === "book" ? "Plan your next wash." : <>Join the<br/><em>walk-in queue.</em></>}</h2><p>{tab === "book" ? "Request a preferred date and time. The team will confirm availability with you." : "Hand the phone to the car owner. We’ll use their WhatsApp number to share their receipt and account link after the wash is completed."}</p><p className="big-brothers-notice pending">No account or payment is required to join the queue.</p></div><div className="request-panel">{tab === "book" && <div className="request-tabs"><strong>FUTURE WASH REQUEST</strong><button type="button" onClick={() => setTab("queue")}>Back to walk-in queue</button></div>}<form onSubmit={submitRequest} className="big-brothers-form"><div className="form-intro"><strong>{tab === "book" ? "Request your next wash" : "Customer details"}</strong><span>{tab === "book" ? "Choose a preferred date and time; the team will confirm availability." : "Your details go to the shared staff queue. We only confirm a queue entry after the server accepts it."}</span></div>
    <section className="big-brothers-section account-section" id="my-account">
      <div className="section-title account-section-heading"><p className="big-brothers-eyebrow">YOUR CUSTOMER ACCOUNT</p><h2>My Big Brothers Car Wash Account.</h2><p>Your completed-wash receipt and secure account link can be sent to your WhatsApp by staff. Open your account to manage your details, receipts, bookings and reminders.</p><div className="account-portal-actions"><a href="/account" className="big-brothers-button primary">My account & receipts ↗</a><a href="/?journey=book#request" className="big-brothers-button secondary">Book my next wash ↗</a><button type="button" className="big-brothers-button secondary" onClick={shareInvite}>Invite friends & family ↗</button></div>{inviteNotice && <p role="status" className="big-brothers-notice pending">{inviteNotice}</p>}</div>
      <div className="account-grid account-grid-home">
        <article className="account-card loyalty-card"><span className="service-category">LOYALTY BALANCE</span><strong className="loyalty-points">{loyaltyPoints}</strong><span>points</span><p>Points are maintained by Big Brothers staff. Automatic points and discounts are not active until the business confirms the rules.</p><a className="text-link" href="/account">View my account details ↗</a></article>
        <article className="account-card account-weather-card"><div className="account-card-heading"><span className="service-category">G-WEST WEATHER</span><p>Current conditions are a guide, not a promise about service availability.</p></div><div className="account-weather"><LocationWeather showLocationGuide={false}/></div></article>
        <article className="account-card account-reminders-card"><span className="service-category">STAY IN THE LOOP</span><h3>Booking reminders</h3><p>Choose an in-app reminder preference or enable push alerts on this device. Push needs browser permission and the configured Firebase Web Push key.</p><label className="reminder-toggle"><input type="checkbox" checked={remindersEnabled} onChange={e=>setRemindersEnabled(e.target.checked)}/> In-app booking reminders</label><button type="button" className="big-brothers-button secondary" onClick={()=>void saveReminderChoice()} disabled={!userId || !online}>Save preference</button><button type="button" className="big-brothers-button primary" onClick={()=>void enablePush()} disabled={!userId || !online}>Enable push reminders</button><p className="reminder-disclaimer">Only upcoming confirmed bookings are eligible for configured push reminders. Permission or a saved preference alone does not confirm delivery.</p>{reminderNotice&&<p className="big-brothers-notice pending">{reminderNotice}</p>}{pushNotice&&<p className="big-brothers-notice pending">{pushNotice}</p>}</article>
      </div>
    </section>
    <section className="big-brothers-section racing-section" id="big-brothers-racing" aria-label="Big Brothers Racing"><div className="racing-section-intro"><p className="big-brothers-eyebrow">WHILE YOUR WASH IS GETTING READY</p><h2>Big Brothers Racing.</h2><p>Take a quick solo race, chase your personal best, and invite family or friends to try the track.</p><p className="racing-reward-note"><strong>High-score discounts are coming soon.</strong> Game scores do not earn or redeem discounts yet.</p></div><RacingWarmup embedded /></section>
    <footer className="big-brothers-footer"><a href="#request" className="big-brothers-brand"><span className="big-brothers-mark">BB</span><span>{businessName}<small>Wash. Care. Go.</small></span></a><span>G-West, Gaborone · Wash. Care. Go.</span><a href="/account">My account</a><a href="/games">Racing garage</a><a href="/iphone-install">Install on iPhone</a><a href="/admin">Staff sign in</a></footer>
    <aside className="bb-help-widget" aria-label="Customer quick help">{chatOpen && <section className="bb-help-panel" aria-labelledby="bb-help-title"><p className="big-brothers-eyebrow">QUICK HELP</p><h2 id="bb-help-title">What do you need?</h2><p>This guide opens real app pages and actions; it is not a live agent chat.</p><a href="#request" onClick={()=>setChatOpen(false)}>Join the walk-in queue ↗</a><a href="/account" onClick={()=>setChatOpen(false)}>My account & receipts ↗</a><a href="/?journey=book#request" onClick={()=>setChatOpen(false)}>Book another wash ↗</a><a href="#big-brothers-racing" onClick={()=>setChatOpen(false)}>Play Big Brothers Racing ↗</a><a href="#my-account" onClick={()=>setChatOpen(false)}>Weather & reminders ↗</a></section>}<button type="button" className="bb-help-launcher" aria-expanded={chatOpen} onClick={()=>setChatOpen(open=>!open)}><span aria-hidden="true">{chatOpen?"×":"?"}</span>{chatOpen?"Close help":"Need a hand?"}</button></aside>
{timePickerOpen && <div className="time-picker-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setTimePickerOpen(false);}}><section className="time-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="time-picker-title"><button type="button" className="time-picker-close" aria-label="Close date and time picker" onClick={()=>setTimePickerOpen(false)}>×</button><p className="big-brothers-eyebrow">BOOK A WASH</p><h2 id="time-picker-title">Choose a time.</h2><p className="time-picker-intro">Pick your preferred date and time. The team will confirm the booking request.</p><label>Date<input type="date" min={new Date().toISOString().slice(0,10)} value={bookingDate} onChange={event=>setBookingDate(event.target.value)}/></label><div className="time-picker-label">Preferred time</div><div className="time-picker-slots">{Array.from({length:19},(_,i)=>{const minutes=8*60+i*30;const hour=Math.floor(minutes/60);const minute=minutes%60;const value=`${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;return <button type="button" key={value} className={bookingTime===value?"selected":""} onClick={()=>setBookingTime(value)}>{new Date(2000,0,1,hour,minute).toLocaleTimeString("en-BW",{hour:"numeric",minute:"2-digit"})}</button>})}</div><p className="time-picker-footnote">Preferred slots are requests, not confirmed availability.</p><button type="button" className="big-brothers-button primary time-picker-confirm" disabled={!bookingDate||!bookingTime||new Date(`${bookingDate}T${bookingTime}`).getTime()<=Date.now()} onClick={()=>setTimePickerOpen(false)}>Use this time ↗</button></section></div>}
  </main>;
}
