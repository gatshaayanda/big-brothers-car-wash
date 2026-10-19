"use client";

import { useEffect, useMemo, useState } from "react";
import { generateReactHelpers } from "@uploadthing/react";
import type { OurFileRouter } from "@/app/api/uploadthing/core";

const { useUploadThing } = generateReactHelpers<OurFileRouter>();

export type AccountAttachment = { name: string; url: string; type: string; size: number };
export type AccountMessage = { id: string; from: "customer" | "studio"; text: string; createdAt: string; attachment?: AccountAttachment };
export type WorkspaceOrder = { id: string; serviceId: string; serviceName: string; price: number; dueDate: string; customerName: string; email: string; brief: string; status: string; createdAt: string; messages?: AccountMessage[] };

type Props = {
  orders: WorkspaceOrder[];
  email: string;
  setEmail: (email: string) => void;
  online: boolean;
  announcement: string;
  onBrowse: () => void;
  onUpdateOrder: (orderId: string, update: (order: WorkspaceOrder) => WorkspaceOrder, notice: string) => void;
};

const money = (amount: number) => "P" + amount.toLocaleString("en-BW", { maximumFractionDigits: 2 });
const prettyDate = (value: string) => {
  try { return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
  catch { return value; }
};

export default function AccountWorkspace({ orders, email, setEmail, online, announcement, onBrowse, onUpdateOrder }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [uploadingOrder, setUploadingOrder] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadNotice, setUploadNotice] = useState("");
  const [gardenSeeds, setGardenSeeds] = useState(0);
  const [journal, setJournal] = useState("");
  const [savedJournal, setSavedJournal] = useState("");
  const [extrasReady, setExtrasReady] = useState(false);
  const [projectTips, setProjectTips] = useState(true);
  const [studioNotes, setStudioNotes] = useState(true);
  const [openThread, setOpenThread] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("iteration13:account-extras:v1");
      if (saved) {
        const parsed = JSON.parse(saved) as { gardenSeeds?: number; savedJournal?: string; projectTips?: boolean; studioNotes?: boolean };
        setGardenSeeds(Number.isFinite(parsed.gardenSeeds) ? Math.max(0, Number(parsed.gardenSeeds)) : 0);
        setJournal(typeof parsed.savedJournal === "string" ? parsed.savedJournal.slice(0, 500) : "");
        setSavedJournal(typeof parsed.savedJournal === "string" ? parsed.savedJournal.slice(0, 500) : "");
        setProjectTips(parsed.projectTips !== false);
        setStudioNotes(parsed.studioNotes !== false);
      }
    } catch { /* Account extras are optional when browser storage is blocked. */ }
    setExtrasReady(true);
  }, []);

  useEffect(() => {
    if (!extrasReady) return;
    try { window.localStorage.setItem("iteration13:account-extras:v1", JSON.stringify({ gardenSeeds, savedJournal, projectTips, studioNotes })); }
    catch { /* Order history and messages remain usable if optional extras cannot be saved. */ }
  }, [extrasReady, gardenSeeds, savedJournal, projectTips, studioNotes]);

  const { startUpload, isUploading } = useUploadThing("fileUploader", {
    onUploadProgress: progress => setUploadProgress(Math.max(0, Math.min(100, Math.round(progress)))),
    onUploadError: error => { setUploadNotice(error.message || "Upload failed. Your message has not been sent."); setUploadingOrder(null); setUploadProgress(0); },
  });

  const filteredOrders = useMemo(() => orders.filter(order => !email.trim() || order.email.toLowerCase() === email.trim().toLowerCase()), [orders, email]);
  const totalMessages = filteredOrders.reduce((total, order) => total + (order.messages?.length || 0), 0);
  const openOrders = filteredOrders.filter(order => !["Completed", "Declined"].includes(order.status)).length;
  const fileCount = filteredOrders.reduce((total, order) => total + (order.messages || []).filter(message => Boolean(message.attachment)).length, 0);
  const seeds = gardenSeeds + filteredOrders.length + Math.floor(totalMessages / 2);

  function sendMessage(order: WorkspaceOrder, attachment?: AccountAttachment) {
    const text = (drafts[order.id] || "").trim();
    if (!text && !attachment) { setUploadNotice("Write a message or attach a file before sending."); return; }
    const message: AccountMessage = { id: "MSG-" + Date.now().toString(36), from: "customer", text, createdAt: new Date().toISOString(), ...(attachment ? { attachment } : {}) };
    onUpdateOrder(order.id, current => ({ ...current, messages: [...(current.messages || []), message] }), "Message saved in this browser's demo thread. The studio can see it in the Admin demo on this device.");
    setDrafts(current => ({ ...current, [order.id]: "" }));
    setUploadNotice("Message added to this local demo thread.");
    setOpenThread(order.id);
  }

  async function attachFile(order: WorkspaceOrder, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const accepted = file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf";
    if (!accepted) { setUploadNotice("Choose an image, video or PDF file."); event.target.value = ""; return; }
    const max = file.type.startsWith("video/") ? 16 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > max) { setUploadNotice(file.type.startsWith("video/") ? "Videos must be 16 MB or smaller." : "Images and PDFs must be 4 MB or smaller."); event.target.value = ""; return; }
    if (!online || !navigator.onLine) { setUploadNotice("Offline: you can still send a text message, but file uploads need internet. Nothing was uploaded."); event.target.value = ""; return; }
    setUploadingOrder(order.id); setUploadProgress(0); setUploadNotice("Uploading attachment. Keep this page open.");
    try {
      const uploaded = await startUpload([file]);
      const result = uploaded?.[0];
      const url = result?.ufsUrl || result?.url;
      if (!url) { setUploadNotice("Upload completed without a file link. Please try again."); setUploadingOrder(null); return; }
      sendMessage(order, { name: file.name, url, type: file.type, size: file.size });
      setUploadNotice("Attachment uploaded and added to the local demo thread.");
    } catch {
      setUploadNotice("Upload failed. Check your connection and try again; the message was not sent.");
    } finally {
      setUploadingOrder(null); setUploadProgress(0); event.target.value = "";
    }
  }

  return <section className="sd-account sd-wrap">
    <div className="sd-account-head">
      <span className="sd-kicker">YOUR SPACE / ACCOUNT</span>
      <h1>Your projects.<br/><em>All here.</em></h1>
      <p>Track requests, share files, and keep project messages together. This prototype stores account activity in this browser, not in a shared customer account.</p>
      <button className="sd-button sd-outline" onClick={onBrowse}>← Back to services</button>
    </div>
    <div className="sd-account-content">
      <div className="sd-account-filter"><label>Find your requests by email<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="The email used on your order" autoComplete="email" /></label><span>{filteredOrders.length} {filteredOrders.length === 1 ? "project" : "projects"} found</span></div>
      <div className="sd-account-stats"><article><span>Active projects</span><strong>{openOrders}</strong><small>Not completed or declined</small></article><article><span>Conversation</span><strong>{totalMessages}</strong><small>Saved local messages</small></article><article><span>Shared files</span><strong>{fileCount}</strong><small>Attachments in your threads</small></article></div>
      {filteredOrders.length === 0 ? <div className="sd-empty"><span>↗</span><h2>Your next project starts here.</h2><p>No matching requests on this browser yet. Use the same browser and email you entered when submitting a service request.</p><button className="sd-button sd-primary" onClick={onBrowse}>Browse services →</button></div> : <div className="sd-orders">{filteredOrders.map(order => {
        const messages = order.messages || [];
        const expanded = openThread === order.id;
        return <article className="sd-order-card sd-workspace-order" key={order.id}>
          <div className="sd-order-card-top"><span>{order.id}</span><b>{order.status}</b></div>
          <div className="sd-order-card-main"><div><h2>{order.serviceName}</h2><p>Requested timeline: <strong>{order.dueDate}</strong></p><p>{order.brief || "No extra brief added."}</p><small>Submitted {prettyDate(order.createdAt)}</small></div><strong className="sd-order-price">{money(order.price)}</strong></div>
          <div className="sd-workspace-meta"><span>{messages.length} {messages.length === 1 ? "message" : "messages"}</span><span>{messages.filter(message => message.from === "studio").length ? "Studio replied" : "Awaiting studio reply"}</span><button className="sd-small-button" onClick={() => setOpenThread(expanded ? null : order.id)}>{expanded ? "Close conversation" : "Messages & files →"}</button></div>
          {expanded && <div className="sd-thread">
            <div className="sd-thread-heading"><div><span className="sd-kicker">PROJECT / CONVERSATION</span><h3>Talk about {order.serviceName}</h3></div><span className="sd-local-pill">LOCAL DEMO</span></div>
            <p className="sd-admin-help">Messages are saved to this browser and appear in the Admin demo on the same device. They are not emailed or sent to a remote team.</p>
            <div className="sd-thread-messages" aria-live="polite">{messages.length ? messages.map(message => <article key={message.id} className={"sd-thread-message is-" + message.from}><div><strong>{message.from === "customer" ? "You" : "Studio / Admin"}</strong><time>{prettyDate(message.createdAt)}</time></div>{message.text && <p>{message.text}</p>}{message.attachment && <a href={message.attachment.url} target="_blank" rel="noreferrer">↗ {message.attachment.name} · Open attachment</a>}</article>) : <p className="sd-thread-empty">No messages yet. Add a question or share a file for the studio to review in this demo.</p>}</div>
            <form className="sd-thread-composer" onSubmit={event => { event.preventDefault(); sendMessage(order); }}>
              <label htmlFor={"message-" + order.id}>Message the studio<textarea id={"message-" + order.id} rows={3} maxLength={1200} value={drafts[order.id] || ""} onChange={event => setDrafts(current => ({ ...current, [order.id]: event.target.value }))} placeholder="Ask a question, clarify your brief, or share the next step…" /></label>
              <div className="sd-thread-actions"><label className="sd-file-button">＋ Attach file<input type="file" accept="image/*,video/*,application/pdf" disabled={isUploading || !online} onChange={event => attachFile(order, event)} /></label><button className="sd-button sd-primary" type="submit" disabled={isUploading || !(drafts[order.id] || "").trim()}>Send message →</button></div>
              {uploadingOrder === order.id && <div className="sd-media-progress" role="status"><div className="sd-media-progress-copy"><strong>Uploading attachment</strong><span>{uploadProgress}%</span></div><div className="sd-media-progress-track" role="progressbar" aria-label="Attachment upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}><span style={{ width: uploadProgress + "%" }} /></div></div>}
            </form>
          </div>}
        </article>;
      })}</div>}
      {uploadNotice && <p className="sd-media-status" role="status">{uploadNotice}</p>}
      <div className="sd-account-extras">
        <section className="sd-account-extra"><span className="sd-kicker">01 / PROJECT GARDEN</span><h2>Grow your next idea.</h2><p>A tiny, playful studio garden grows as you work through project steps. It is a creative progress marker, not a productivity score.</p><div className="sd-garden-scene" aria-label={seeds + " project seeds tended"}><span>{seeds > 0 ? "🌱" : "🪴"}</span><div><strong>{seeds} seeds planted</strong><small>{filteredOrders.length} project(s) · {totalMessages} message(s)</small></div>{seeds >= 5 ? <span>🌿</span> : <span>✳</span>}</div><button className="sd-button sd-primary" onClick={() => setGardenSeeds(value => value + 1)}>Plant a seed +1</button><p className="sd-account-note">Your garden is a small theme-specific demo interaction. Garden progress and saved notes stay on this browser; request and message counts come from this browser's saved records.</p></section>
        <section className="sd-account-extra"><span className="sd-kicker">02 / PROJECT JOURNAL</span><h2>Keep a thought.</h2><p>Save a short intention, question or idea while you plan. This journal stays in this browser and is not a secure private vault.</p><label className="sd-journal-label" htmlFor="studio-journal">A note for your next step<textarea id="studio-journal" rows={4} maxLength={500} value={journal} onChange={event => setJournal(event.target.value)} placeholder="What should we remember for this project?" /></label><div className="sd-journal-actions"><span>{journal.length}/500 characters</span><button className="sd-small-button" onClick={() => setSavedJournal(journal.trim())}>Save note</button></div>{savedJournal && <p className="sd-saved-note"><strong>Saved note</strong>{savedJournal}</p>}</section>
      </div>
      <div className="sd-account-extras sd-account-followup">
        <section className="sd-account-extra"><span className="sd-kicker">03 / STUDIO NOTES</span><h2>{announcement.trim() ? "Published studio note." : "A little help between steps."}</h2>{announcement.trim() && studioNotes ? <div className="sd-published-note"><span>LIVE IN THIS DEMO</span><p>{announcement}</p></div> : <p>{studioNotes ? "There is no published studio note right now. New offers or project updates will appear here when the demo admin publishes an announcement." : "Studio notes are switched off in your local preferences."}</p>}<div className="sd-studio-feed">{(projectTips ? [
          { title: "Bring one clear reference", body: "A screenshot, sketch or example helps turn a broad idea into a useful first draft." },
          { title: "Keep the first version focused", body: "Choose the one customer action or project outcome that matters most before adding extras." },
          { title: "Confirm the timeline together", body: "Your requested date is a preference until scope and delivery are reviewed." }
        ] : []).map((item, index) => <article key={item.title}><span>NOTE / 0{index + 1}</span><strong>{item.title}</strong><p>{item.body}</p></article>)}</div></section>
        <section className="sd-account-extra"><span className="sd-kicker">04 / YOUR PREFERENCES</span><h2>Keep it relevant.</h2><p>Choose what appears in this account view. These local preferences do not send emails or system notifications.</p><label className="sd-preference-toggle"><input type="checkbox" checked={projectTips} onChange={event => setProjectTips(event.target.checked)} /><span><strong>Project tips & next steps</strong><small>Show general notes that can help with planning.</small></span></label><label className="sd-preference-toggle"><input type="checkbox" checked={studioNotes} onChange={event => setStudioNotes(event.target.checked)} /><span><strong>Published studio notes</strong><small>Show the current demo announcement or offer.</small></span></label><p className="sd-account-note">Preferences are saved in this browser. Real push notifications, email updates and account sync are not configured in this prototype.</p></section>
      </div>
      <section className="sd-account-extra sd-account-guide"><span className="sd-kicker">05 / YOUR NEXT STEP</span><h2>Make progress, not guesswork.</h2><div className="sd-next-steps"><article><b>01</b><strong>Review your brief</strong><p>Make sure your requested date and project details are clear.</p></article><article><b>02</b><strong>Share a reference</strong><p>Use the conversation to attach an image, PDF or short video while online.</p></article><article><b>03</b><strong>Keep the thread handy</strong><p>Check your messages and status again when you return to this browser.</p></article></div></section>
      <p className="sd-local-warning">Offline ready for local browsing and text messages after the app shell is cached. Requests, messages and status updates remain on this browser only. Attachments need internet and upload to UploadThing; they are not queued for offline upload.</p>
    </div>
  </section>;
}
