"use client";

import Link from "next/link";
import ServiceGuide from "@/app/ServiceGuide";
import ServiceMediaPicker from "@/app/ServiceMediaPicker";
import AccountWorkspace, { type AccountMessage } from "@/app/AccountWorkspace";
import { useEffect, useMemo, useState } from "react";

type Service = { id: string; name: string; price: number; description: string; media: string; mediaType: "image" | "video"; active: boolean };
type DemoOrder = { id: string; serviceId: string; serviceName: string; price: number; dueDate: string; customerName: string; email: string; brief: string; status: string; createdAt: string; messages?: AccountMessage[] };
type DemoData = { services: Service[]; orders: DemoOrder[]; announcement: string; views: number };
const STORAGE_KEY = "iteration13:service-demo:v1";
const seedServices: Service[] = [
  { id: "website", name: "Website", price: 100, description: "A clear, professional home for your business, services and contact details.", media: "https://images.unsplash.com/photo-1467232004584-a241de8bcf5d?auto=format&fit=crop&w=1200&q=80", mediaType: "image", active: true },
  { id: "app", name: "App", price: 200, description: "A mobile-first app experience built around the way your customers work.", media: "https://images.unsplash.com/photo-1551650975-87deedd944c3?auto=format&fit=crop&w=1200&q=80", mediaType: "image", active: true },
  { id: "support", name: "Monthly support", price: 50, description: "Ongoing updates, small improvements and practical help after launch.", media: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80", mediaType: "image", active: true },
  { id: "phaser", name: "Phaser games", price: 500, description: "A custom browser game concept built for play, learning or promotion.", media: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80", mediaType: "image", active: true },
];
const emptyData: DemoData = { services: seedServices, orders: [], announcement: "", views: 0 };
const money = (amount: number) => "P" + amount.toLocaleString("en-BW", { maximumFractionDigits: 2 });
const localDate = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-"); };

export default function Home() {
  const [data, setData] = useState<DemoData>(emptyData);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<"shop" | "account" | "admin">("shop");
  const [selected, setSelected] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [brief, setBrief] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("100");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceMedia, setServiceMedia] = useState("");
  const [serviceMediaType, setServiceMediaType] = useState<"image" | "video">("image");
  const [serviceMediaUploading, setServiceMediaUploading] = useState(false);
  const [serviceActive, setServiceActive] = useState(true);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const [adminReplyDrafts, setAdminReplyDrafts] = useState<Record<string, string>>({});
  const [pendingConfirm, setPendingConfirm] = useState<{ kind: "delete-service" | "reset-demo"; serviceId?: string; serviceName?: string } | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<DemoData>;
        setData({ services: Array.isArray(parsed.services) ? parsed.services : seedServices, orders: Array.isArray(parsed.orders) ? parsed.orders : [], announcement: typeof parsed.announcement === "string" ? parsed.announcement : "", views: (Number(parsed.views) || 0) + 1 });
        setAnnouncementDraft(typeof parsed.announcement === "string" ? parsed.announcement : "");
      } else setData(current => ({ ...current, views: 1 }));
    } catch { setNotice("Local demo storage is unavailable in this browser. You can explore, but changes may not persist."); }
    setReady(true);
    setOnline(navigator.onLine);
    const syncOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "account") setView("account");
    if (window.location.hash === "#admin") setView("admin");
    return () => { window.removeEventListener("online", syncOnline); window.removeEventListener("offline", syncOnline); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { setNotice("The browser could not save this change locally. Check available storage."); }
  }, [data, ready]);

  useEffect(() => {
    if (!notice) return;
    const duration = /^(Choose|Add |Enter |The browser|Local demo storage|Could not save)/i.test(notice) ? 6500 : 4200;
    const timeout = window.setTimeout(() => setNotice(current => current === notice ? "" : current), duration);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!pendingConfirm) return;
    const keepDialogAccessible = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPendingConfirm(null); return; }
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".sd-confirm-dialog");
      const focusable = dialog?.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input,select,textarea");
      if (!focusable?.length) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", keepDialogAccessible);
    return () => window.removeEventListener("keydown", keepDialogAccessible);
  }, [pendingConfirm]);

  useEffect(() => {
    if (!ready) return;
    if (view === "account") window.history.replaceState({}, "", "/?view=account");
    else if (view === "shop") window.history.replaceState({}, "", "/");
    else window.history.replaceState({}, "", "/#admin");
  }, [view, ready]);

  function commitData(update: (current: DemoData) => DemoData, successMessage: string) {
    const next = update(data);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setNotice("Could not save that change on this device. Check browser storage and try again.");
      return false;
    }
    setData(next);
    setNotice(successMessage);
    return true;
  }

  function toggleService(service: Service) {
    return commitData(current => ({ ...current, services: current.services.map(item => item.id === service.id ? { ...item, active: !item.active } : item) }), `${service.name} ${service.active ? "hidden" : "visible"} in the demo.`);
  }

  const activeServices = data.services.filter(service => service.active);
  const selectedService = data.services.find(service => service.id === selected && service.active);
  const myOrders = useMemo(() => data.orders.filter(order => !email.trim() || order.email.toLowerCase() === email.trim().toLowerCase()), [data.orders, email]);
  const statusCounts = useMemo(() => data.orders.reduce<Record<string, number>>((acc, order) => { acc[order.status] = (acc[order.status] || 0) + 1; return acc; }, {}), [data.orders]);

  function beginOrder(service: Service) {
    setSelected(service.id); setView("shop"); setNotice(`${service.name} selected. Add your details and requested date below.`); setDueDate(""); setBrief("");
    window.setTimeout(() => document.getElementById("service-order")?.scrollIntoView({ behavior: "smooth", block: "start" }), 90);
  }

  function openAdminGuide(target?: "services" | "announcement" | "requests") {
    setView("admin");
    const targetId = target === "services" ? "admin-service-tools" : target === "announcement" ? "admin-announcement-tools" : target === "requests" ? "admin-requests-tools" : "admin-tools";
    window.setTimeout(() => document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }
  function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService) { setNotice("Choose a service first."); return; }
    if (!customerName.trim() || !email.trim() || !dueDate) { setNotice("Add your name, email and requested timeline date."); return; }
    if (dueDate < localDate()) { setNotice("Choose today or a future date for your requested timeline."); return; }
    const order: DemoOrder = { id: "DEMO-" + Date.now().toString(36).toUpperCase(), serviceId: selectedService.id, serviceName: selectedService.name, price: selectedService.price, dueDate, customerName: customerName.trim(), email: email.trim(), brief: brief.trim(), status: "New request", createdAt: new Date().toISOString() };
    if (!commitData(current => ({ ...current, orders: [order, ...current.orders] }), "Order request saved on this device. No payment was taken.")) return;
    setView("account"); setSelected(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startEdit(service: Service) {
    setEditingId(service.id); setServiceName(service.name); setServicePrice(String(service.price)); setServiceDescription(service.description); setServiceMedia(service.media); setServiceMediaType(service.mediaType); setServiceActive(service.active);
    document.getElementById("admin-service-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(servicePrice);
    if (!serviceName.trim() || !Number.isFinite(price) || price < 0) { setNotice("Enter a service name and a valid price."); return; }
    if (serviceMediaUploading) { setNotice("Wait for the media upload to finish before saving the service."); return; }
    if (serviceMedia.trim()) { try { const parsedMedia = new URL(serviceMedia.trim()); if (parsedMedia.protocol !== "https:" && parsedMedia.protocol !== "http:") throw new Error("Unsupported protocol"); } catch { setNotice("Enter a valid http:// or https:// media URL, or upload the file first."); return; } }
    const service: Service = { id: editingId || "service-" + Date.now().toString(36), name: serviceName.trim(), price, description: serviceDescription.trim(), media: serviceMedia.trim(), mediaType: serviceMediaType, active: serviceActive };
    if (!commitData(current => ({ ...current, services: editingId ? current.services.map(item => item.id === editingId ? service : item) : [...current.services, service] }), editingId ? "Service updated and saved on this device." : "Service added and saved on this device.")) return;
    resetServiceForm();
  }
  function resetServiceForm() { setEditingId(null); setServiceName(""); setServicePrice("100"); setServiceDescription(""); setServiceMedia(""); setServiceMediaType("image"); setServiceActive(true); }
  function updateOrder(id: string, status: string) { const order = data.orders.find(item => item.id === id); commitData(current => ({ ...current, orders: current.orders.map(item => item.id === id ? { ...item, status } : item) }), order ? `${order.serviceName} status changed to ${status}. Saved on this device.` : "Request status saved on this device."); }
  function replyToOrder(id: string) {
    const text = (adminReplyDrafts[id] || "").trim();
    if (!text) { setNotice("Write a reply before sending it."); return; }
    const message: AccountMessage = { id: "MSG-" + Date.now().toString(36), from: "studio", text, createdAt: new Date().toISOString() };
    if (commitData(current => ({ ...current, orders: current.orders.map(order => order.id === id ? { ...order, messages: [...(order.messages || []), message] } : order) }), "Studio reply saved to this browser's demo thread.")) setAdminReplyDrafts(current => ({ ...current, [id]: "" }));
  }

  return <main className="serviceDemo">
    <div className="sd-topline"><div className="sd-wrap"><span>ITERATION 13 / SERVICE STUDIO</span><span className={online ? "sd-connect" : "sd-connect is-offline"}><i />{online ? "Demo ready" : "Offline · local demo"}</span></div></div>
    <header className="sd-header"><div className="sd-wrap sd-nav"><button className="sd-brand" onClick={() => { setView("shop"); setNotice(""); }} aria-label="Back to services"><span className="sd-logo">13</span><span><strong>STUDIO / 13</strong><small>WEBSITES · APPS · GAMES</small></span></button><nav aria-label="Main navigation"><button onClick={() => { setView("shop"); setNotice(""); }}>Services</button><button onClick={() => { setView("account"); setNotice(""); }}>My account <span className="sd-count">{data.orders.length}</span></button><Link href="/iphone-install">Install guide</Link></nav></div></header>

    {view === "shop" && <>
      <section className="sd-hero"><div className="sd-wrap sd-hero-grid"><div className="sd-hero-copy"><span className="sd-kicker"><i /> DIGITAL PRODUCTS, BUILT WITH YOU</span><h1>Your next idea,<br /><em>made real.</em></h1><p>Websites, apps, ongoing support and browser games. Choose what you need, tell us your timeline, and send an order request in a few steps.</p><div className="sd-hero-actions"><a className="sd-button sd-primary" href="#services">Explore services <span>↓</span></a><button className="sd-button sd-outline" onClick={() => setView("account")}>View my requests ↗</button></div><div className="sd-hero-meta"><span><b>01</b> Clear starting prices</span><span><b>02</b> Your timeline</span><span><b>03</b> Order tracking</span></div></div><div className="sd-hero-art"><div className="sd-art-window"><div className="sd-window-bar"><i/><i/><i/><span>YOUR NEXT BIG THING</span></div><div className="sd-art-grid"><div className="sd-art-block sd-art-blue"><span>01 / WEB</span><strong>Make it<br/>click.</strong><small>Website · P100</small></div><div className="sd-art-block sd-art-lime"><span>02 / PLAY</span><strong>Press<br/>start.</strong><small>Phaser · P500</small></div><div className="sd-art-block sd-art-paper"><span>03 / MOBILE</span><strong>Made for<br/>the move.</strong><small>Apps · P200</small></div></div></div><div className="sd-sticky-note"><b>YOUR IDEA, NEXT</b><span>Pick a service.<br/>Set a date.</span><i>↗</i></div></div></div></section>
      {data.announcement.trim() && <section className="sd-announcement"><div className="sd-wrap"><span>STUDIO NOTE / SPECIAL</span><p>{data.announcement}</p></div></section>}
      <section className="sd-services sd-wrap" id="services"><div className="sd-section-head"><div><span className="sd-kicker">THE MENU / 01—04</span><h2>What are we<br/><em>building?</em></h2></div><p>Starting prices to help you plan. Your requested date is a timeline preference; final scope and delivery are confirmed after review.</p></div><div className="sd-service-grid">{activeServices.map((service, index) => <article className="sd-service-card" key={service.id}><div className={"sd-service-media sd-media-" + (index % 4)} data-label={service.name}>{service.media && service.mediaType === "video" ? <video src={service.media} controls muted playsInline preload="metadata" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("media-fallback"); }} /> : service.media ? <img src={service.media} alt={service.name + " project preview"} loading="lazy" onError={event => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("media-fallback"); }} /> : <div className="sd-media-placeholder"><span>STUDIO / 13</span><strong>{service.name}</strong></div>}<span className="sd-service-index">0{index + 1}</span></div><div className="sd-service-info"><div className="sd-service-title"><h3>{service.name}</h3><strong>{money(service.price)}</strong></div><p>{service.description}</p><button className="sd-order-button" onClick={() => beginOrder(service)}>Request this service <span>↗</span></button></div></article>)}</div>
      </section>
      <section className="sd-order-section" id="service-order"><div className="sd-wrap sd-order-grid"><div className="sd-order-copy"><span className="sd-kicker">YOUR BRIEF / NEXT STEP</span><h2>Let’s put a<br/><em>date on it.</em></h2><p>Choose a service above, add the date you’re working toward, and send your request. The team can review the scope and confirm what’s realistic.</p><div className="sd-order-note"><span>↗</span><p><strong>No checkout pressure.</strong><br/>This demo records a request only. It does not take payment or promise a delivery date.</p></div></div><form className="sd-order-form" onSubmit={submitOrder}><div className="sd-form-heading"><span>START A REQUEST</span><strong>{selectedService ? selectedService.name : "Choose a service above"}</strong>{selectedService && <b>{money(selectedService.price)} <small>starting price</small></b>}</div><label>Service<select value={selected || ""} onChange={event => setSelected(event.target.value || null)} required><option value="">Select a service</option>{activeServices.map(service => <option key={service.id} value={service.id}>{service.name} — {money(service.price)}</option>)}</select></label><div className="sd-form-two"><label>Your name<input value={customerName} onChange={event => setCustomerName(event.target.value)} autoComplete="name" required placeholder="Name or business" /></label><label>Email<input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="you@example.com" /></label></div><label>Requested timeline date<input type="date" value={dueDate} min={localDate()} onChange={event => setDueDate(event.target.value)} required /><small>Pick the date you’re aiming for. It will be reviewed before anything is confirmed.</small></label><label>What do you have in mind? <span className="sd-optional">OPTIONAL</span><textarea value={brief} onChange={event => setBrief(event.target.value)} rows={4} placeholder="A few details about your idea, features or goals…" /></label><button className="sd-button sd-primary sd-submit" type="submit">Submit order request <span>→</span></button><p className="sd-privacy-note">Demo only · saved to this browser · no payment taken</p></form></div></section>
      <section className="sd-how sd-wrap"><span className="sd-kicker">HOW IT WORKS</span><div className="sd-how-grid"><article><b>01</b><h3>Choose</h3><p>Pick a service and starting price.</p></article><article><b>02</b><h3>Set a date</h3><p>Tell us the timeline you’re aiming for.</p></article><article><b>03</b><h3>Send</h3><p>Your request appears in your demo account.</p></article><article><b>04</b><h3>Review</h3><p>See the request in the local admin demo.</p></article></div></section>
    </>}

    {view === "account" && <AccountWorkspace orders={data.orders} email={email} setEmail={setEmail} online={online} onBrowse={() => { setView("shop"); setNotice(""); }} onUpdateOrder={(orderId, update, message) => { commitData(current => ({ ...current, orders: current.orders.map(order => order.id === orderId ? update(order) : order) }), message); }} />}

    {view === "admin" && <section className="sd-admin sd-wrap"><div className="sd-admin-head"><div><span className="sd-kicker">OPERATIONS / LOCAL DEMO</span><h1>Studio control.<br/><em>Keep it moving.</em></h1><p>Manage the service menu, special announcement and incoming demo requests. Changes are stored in this browser only.</p></div><div className="sd-admin-head-actions"><button className="sd-button sd-outline" onClick={() => setView("shop")}>View storefront ↗</button><button className="sd-button sd-outline" onClick={() => setView("account")}>Customer account ↗</button></div></div><div className="sd-stats"><article><span>Submitted requests</span><strong>{data.orders.length}</strong><small>{data.views > 0 ? Math.round(data.orders.length / data.views * 100) : 0}% visit-to-request rate</small></article><article><span>New requests</span><strong>{statusCounts["New request"] || 0}</strong><small>{data.orders.length ? Math.round((statusCounts["New request"] || 0) / data.orders.length * 100) : 0}% of requests</small></article><article><span>Menu services</span><strong>{data.services.length}</strong><small>{data.services.length ? Math.round(activeServices.length / data.services.length * 100) : 0}% visible</small></article><article><span>Customer emails</span><strong>{new Set(data.orders.map(order => order.email.toLowerCase())).size}</strong><small>{data.orders.length ? Math.round(new Set(data.orders.map(order => order.email.toLowerCase())).size / data.orders.length * 100) : 0}% unique emails per request count</small></article><article><span>Store visits this demo</span><strong>{data.views}</strong><small>Local browser count · not unique visitors</small></article></div><section className="sd-admin-panel sd-admin-performance"><div className="sd-panel-head"><div><span className="sd-kicker">04 / DEMO PERFORMANCE</span><h2>Conversion &amp; operations</h2></div><span className="sd-local-pill">LOCAL DEMO DATA</span></div><p className="sd-admin-help">Percentages are calculated from this browser’s saved demo counts only. They are directional indicators, not shared production analytics.</p><div className="sd-performance-grid"><article><div><span>Visit to request</span><strong>{data.views > 0 ? Math.round(data.orders.length / data.views * 100) : 0}%</strong></div><div className="sd-performance-track"><span style={{width: `${Math.min(100, data.views > 0 ? data.orders.length / data.views * 100 : 0)}%`}} /></div><small>{data.orders.length} requests from {data.views} recorded visits</small></article><article><div><span>Visible service menu</span><strong>{data.services.length ? Math.round(activeServices.length / data.services.length * 100) : 0}%</strong></div><div className="sd-performance-track"><span style={{width: `${data.services.length ? activeServices.length / data.services.length * 100 : 0}%`}} /></div><small>{activeServices.length} of {data.services.length} services visible</small></article><article><div><span>Requests needing attention</span><strong>{data.orders.length ? Math.round((data.orders.length - (statusCounts["Completed"] || 0) - (statusCounts["Declined"] || 0)) / data.orders.length * 100) : 0}%</strong></div><div className="sd-performance-track"><span style={{width: `${data.orders.length ? (data.orders.length - (statusCounts["Completed"] || 0) - (statusCounts["Declined"] || 0)) / data.orders.length * 100 : 0}%`}} /></div><small>{data.orders.length - (statusCounts["Completed"] || 0) - (statusCounts["Declined"] || 0)} active of {data.orders.length} requests</small></article><article><div><span>New request share</span><strong>{data.orders.length ? Math.round((statusCounts["New request"] || 0) / data.orders.length * 100) : 0}%</strong></div><div className="sd-performance-track"><span style={{width: `${data.orders.length ? (statusCounts["New request"] || 0) / data.orders.length * 100 : 0}%`}} /></div><small>{statusCounts["New request"] || 0} new of {data.orders.length} requests</small></article></div></section>
      <div className="sd-admin-grid"><section className="sd-admin-panel" id="admin-service-tools"><div className="sd-panel-head"><div><span className="sd-kicker">01 / SERVICE CRUD</span><h2>Service menu</h2></div><button className="sd-small-button" onClick={() => { resetServiceForm(); setNotice("New service form ready."); }}>+ New service</button></div><div className="sd-admin-services">{data.services.map(service => <article key={service.id}><div><strong>{service.name}</strong><span>{money(service.price)} · {service.active ? "Visible" : "Hidden"}</span></div><div className="sd-row-actions"><button onClick={() => { startEdit(service); setNotice(`Editing ${service.name}. Save your changes when ready.`); }}>Edit</button><button onClick={() => toggleService(service)}>{service.active ? "Hide" : "Show"}</button><button className="sd-danger" onClick={() => setPendingConfirm({ kind: "delete-service", serviceId: service.id, serviceName: service.name })}>Delete</button></div></article>)}</div>
      <form className="sd-admin-form" id="admin-service-form" onSubmit={saveService}><h3>{editingId ? "Edit service" : "Add a service"}</h3><label>Service name<input value={serviceName} onChange={event => setServiceName(event.target.value)} required /></label><label>Price in Pula<input type="number" min="0" step="1" value={servicePrice} onChange={event => setServicePrice(event.target.value)} required /></label><label>Description<textarea rows={3} value={serviceDescription} onChange={event => setServiceDescription(event.target.value)} /></label><ServiceMediaPicker value={serviceMedia} type={serviceMediaType} online={online} onChange={(url, type) => { setServiceMedia(url); setServiceMediaType(type); }} onUploadingChange={setServiceMediaUploading} /><label className="sd-check"><input type="checkbox" checked={serviceActive} onChange={event => setServiceActive(event.target.checked)} /> Show on customer storefront</label><div className="sd-form-two"><button className="sd-button sd-primary" type="submit" disabled={serviceMediaUploading}>{serviceMediaUploading ? "Uploading media…" : editingId ? "Save changes" : "Add service"}</button><button className="sd-button sd-outline" type="button" onClick={resetServiceForm}>Cancel</button></div></form></section>
      <section className="sd-admin-panel" id="admin-announcement-tools"><div className="sd-panel-head"><div><span className="sd-kicker">02 / CUSTOMER NOTICE</span><h2>Special announcement</h2></div></div><p className="sd-admin-help">Publish a short promotion or service update. Leave blank to remove it from the storefront.</p><label className="sd-admin-label">Announcement<textarea rows={5} value={announcementDraft} onChange={event => setAnnouncementDraft(event.target.value)} placeholder="Example: Book your next project this month…" /></label><button className="sd-button sd-primary" onClick={() => { commitData(current => ({ ...current, announcement: announcementDraft.trim() }), announcementDraft.trim() ? "Announcement published on this device." : "Announcement cleared from the storefront."); }}>Publish announcement</button><div className="sd-live-preview"><span>STOREFRONT PREVIEW</span><p>{announcementDraft.trim() || "Your announcement will appear here when published."}</p></div><div className="sd-panel-head sd-request-head" id="admin-requests-tools"><div><span className="sd-kicker">03 / INCOMING WORK</span><h2>Customer requests</h2></div></div>{data.orders.length === 0 ? <div className="sd-admin-empty">No requests yet. Submit one from the customer storefront to see the workflow.</div> : <div className="sd-admin-orders">{data.orders.map(order => <article key={order.id}><div className="sd-admin-order-top"><strong>{order.serviceName} · {money(order.price)}</strong><span>{order.id}</span></div><p>{order.customerName} · {order.email}</p><p>Requested date: <b>{order.dueDate}</b></p>{order.brief && <p>{order.brief}</p>}<label>Request status<select value={order.status} onChange={event => updateOrder(order.id, event.target.value)}><option>New request</option><option>Reviewing</option><option>Accepted</option><option>In progress</option><option>Completed</option><option>Declined</option></select></label><div className="sd-admin-thread"><strong>Customer conversation · {(order.messages || []).length} messages</strong>{(order.messages || []).map(message => <div className={"sd-admin-thread-message is-" + message.from} key={message.id}><b>{message.from === "customer" ? "Customer" : "Studio / Admin"}</b><small>{new Date(message.createdAt).toLocaleString()}</small>{message.text && <p>{message.text}</p>}{message.attachment && <a href={message.attachment.url} target="_blank" rel="noreferrer">↗ {message.attachment.name}</a>}</div>)}<form onSubmit={event => { event.preventDefault(); replyToOrder(order.id); }}><label>Reply to customer<textarea rows={2} value={adminReplyDrafts[order.id] || ""} onChange={event => setAdminReplyDrafts(current => ({ ...current, [order.id]: event.target.value }))} placeholder="Write a project update or question…" maxLength={1200}/></label><button className="sd-small-button" type="submit" disabled={!(adminReplyDrafts[order.id] || "").trim()}>Save reply to local thread →</button></form></div></article>)}</div>}</section></div><div className="sd-admin-footer"><button className="sd-button sd-outline" onClick={() => setPendingConfirm({ kind: "reset-demo" })}>Reset demo data</button><p>Prototype only · no Firebase · no shared admin/customer records</p></div></section>}

    <ServiceGuide view={view} services={data.services} requestCount={data.orders.length} onChooseService={beginOrder} onOpenAccount={() => { setView("account"); setNotice(""); }} onOpenAdmin={openAdminGuide} onOpenStorefront={() => { setView("shop"); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
    <footer className="sd-footer"><div className="sd-wrap sd-footer-inner"><button className="sd-brand" onClick={() => { setView("shop"); setNotice(""); }}><span className="sd-logo">13</span><span><strong>STUDIO / 13</strong><small>AN ITERATION 13 DEMO</small></span></button><p>Built to be explored online and offline.</p><div><button onClick={() => { setView("account"); setNotice(""); }}>My account</button><Link href="/patterns">PWA pattern lab</Link><button onClick={() => { setView("admin"); setNotice(""); window.history.replaceState({}, "", "/#admin"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Admin demo ↗</button></div></div></footer>
    {pendingConfirm && <div className="sd-confirm-backdrop" onClick={() => setPendingConfirm(null)}><section className="sd-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sd-confirm-title" aria-describedby="sd-confirm-description" onClick={event => event.stopPropagation()}><span className="sd-kicker">CONFIRM ACTION</span><h2 id="sd-confirm-title">{pendingConfirm.kind === "reset-demo" ? "Reset demo data?" : `Delete ${pendingConfirm.serviceName || "this service"}?`}</h2><p id="sd-confirm-description">{pendingConfirm.kind === "reset-demo" ? "This clears local requests, service edits and the announcement, restoring the starter examples on this device." : "This removes the service from this browser demo. Existing requests keep their saved service name and price."}</p><div className="sd-confirm-actions"><button type="button" className="sd-button sd-outline" autoFocus onClick={() => setPendingConfirm(null)}>Keep it</button><button type="button" className="sd-button sd-primary" onClick={() => { const action = pendingConfirm; setPendingConfirm(null); if (action.kind === "reset-demo") { if (commitData(() => ({ ...emptyData, views: data.views }), "Demo data reset on this device.")) { setAnnouncementDraft(""); resetServiceForm(); } } else if (action.serviceId) { if (commitData(current => ({ ...current, services: current.services.filter(item => item.id !== action.serviceId) }), `${action.serviceName || "Service"} deleted from this demo.`) && editingId === action.serviceId) resetServiceForm(); } }}>Confirm</button></div></section></div>}
    {notice && <div className="sd-toast-region"><div className={"sd-toast" + (/^(Choose|Add |Enter |The browser|Local demo storage|Could not save)/i.test(notice) ? " is-error" : " is-success")} role={/^(Choose|Add |Enter |The browser|Local demo storage|Could not save)/i.test(notice) ? "alert" : "status"}><span className="sd-toast-mark" aria-hidden="true">{/^(Choose|Add |Enter |The browser|Local demo storage|Could not save)/i.test(notice) ? "!" : "✓"}</span><p>{notice}</p><button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>×</button></div></div>}
  </main>;
}
