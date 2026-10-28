"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIdToken, GoogleAuthProvider, linkWithPopup, signInAnonymously, signInWithPopup, signOut } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";

type Receipt = {
  receiptRef: string;
  businessName: string;
  locationName: string;
  customerName: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleRegistration: string;
  serviceName: string;
  amount: number;
  tipAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  joinedAt: string;
  completedAt: string;
  createdAt: string;
  expiresAt: string;
  claimed: boolean;
};

export default function ReceiptView({ token }: { token: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState("");
  const [suggestedDates, setSuggestedDates] = useState<string[]>([]);
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewPublicConsent, setReviewPublicConsent] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoTitle, setPhotoTitle] = useState("");
  const [photoDescription, setPhotoDescription] = useState("");
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoSubmitted, setPhotoSubmitted] = useState(false);
  const [photoMessage, setPhotoMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/receipts/" + encodeURIComponent(token), { cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { receipt?: Receipt; error?: string };
        if (!response.ok || !data.receipt) throw new Error(data.error || "This receipt link is unavailable.");
        if (!cancelled) {
          setReceipt(data.receipt);
          const formatDate = (date: Date) => { const year = date.getFullYear(); const month = String(date.getMonth()+1).padStart(2,"0"); const day = String(date.getDate()).padStart(2,"0"); return year+"-"+month+"-"+day; };
          const visitDate = new Date(data.receipt.completedAt || data.receipt.createdAt || Date.now());
          const baseDate = Number.isFinite(visitDate.getTime()) ? visitDate : new Date();
          setSuggestedDates([14,21].map(days => { const date = new Date(baseDate); date.setDate(date.getDate()+days); return formatDate(date); }));
        }
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "This receipt link is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function submitPhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (photoBusy || photoSubmitted) return;
    if (!photoFile || !photoFile.type.startsWith("image/") || photoFile.size > 8 * 1024 * 1024) {
      setPhotoMessage("Choose an image under 8 MB.");
      return;
    }
    if (!photoConsent) {
      setPhotoMessage("Confirm that Big Brothers may consider this photo for public display.");
      return;
    }
    setPhotoBusy(true);
    setPhotoMessage("Uploading photo securely…");
    try {
      const user = auth.currentUser || (await signInAnonymously(auth)).user;
      const extension = (photoFile.name.split(".").pop() || "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "jpg";
      const storagePath = "gallery-submissions/" + user.uid + "/" + Date.now() + "-" + crypto.randomUUID() + "." + extension;
      const uploaded = await uploadBytes(ref(storage, storagePath), photoFile, { contentType: photoFile.type });
      const imageUrl = await getDownloadURL(uploaded.ref);
      const response = await fetch("/api/receipts/" + encodeURIComponent(token) + "/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, storagePath, title: photoTitle.trim(), description: photoDescription.trim(), publicConsent: photoConsent }),
      });
      const data = await response.json().catch(() => ({})) as { submitted?: boolean; error?: string; message?: string };
      if (!response.ok || !data.submitted) throw new Error(data.error || "Photo submission could not be saved.");
      setPhotoSubmitted(true);
      setPhotoMessage(data.message || "Photo submitted for review.");
    } catch (reason) {
      setPhotoMessage(reason instanceof Error ? reason.message : "Photo upload failed. Check your connection and try again.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewBusy || reviewSubmitted) return;
    setReviewBusy(true);
    setReviewMessage("");
    try {
      const response = await fetch("/api/receipts/" + encodeURIComponent(token) + "/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: Number(reviewRating), comment: reviewComment, publicConsent: reviewPublicConsent }),
      });
      const data = await response.json().catch(() => ({})) as { submitted?: boolean; error?: string; message?: string };
      if (!response.ok || !data.submitted) throw new Error(data.error || "Review could not be saved.");
      setReviewSubmitted(true);
      setReviewMessage(data.message || "Thank you for your feedback.");
    } catch (reason) {
      setReviewMessage(reason instanceof Error ? reason.message : "Review could not be saved.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function claimJob() {
    setClaiming(true);
    setClaimMessage("");
    try {
      const provider = new GoogleAuthProvider();
      let user = auth.currentUser;
      if (user?.isAnonymous) {
        try {
          user = (await linkWithPopup(user, provider)).user;
        } catch (reason) {
          const code = typeof reason === "object" && reason && "code" in reason ? String(reason.code) : "";
          if (!["auth/credential-already-in-use", "auth/email-already-in-use"].includes(code)) throw reason;
          await signOut(auth);
          user = (await signInWithPopup(auth, provider)).user;
        }
      } else if (!user || !user.providerData.some(item => item.providerId === "google.com")) {
        if (user) await signOut(auth);
        user = (await signInWithPopup(auth, provider)).user;
      }
      const idToken = await getIdToken(user);
      const response = await fetch("/api/receipts/claim", {
        method: "POST",
        headers: { Authorization: "Bearer " + idToken, "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; claimed?: boolean };
      if (!response.ok || !data.claimed) throw new Error(data.error || "The job could not be claimed.");
      setClaimMessage("Claim confirmed. This completed wash is now linked to your signed-in account.");
      setReceipt(current => current ? { ...current, claimed: true } : current);
    } catch (reason) {
      setClaimMessage(reason instanceof Error ? reason.message : "The job could not be claimed. Keep this receipt link and try again.");
    } finally {
      setClaiming(false);
    }
  }

  if (loading) return <main className="receipt-page"><section className="receipt-card"><p>Loading secure receipt…</p></section></main>;
  if (error || !receipt) return <main className="receipt-page"><section className="receipt-card"><span className="receipt-mark">BB</span><p className="big-brothers-eyebrow">BIG BROTHERS CAR WASH</p><h1>Receipt unavailable.</h1><p>{error || "This receipt link is invalid or has expired."}</p><Link className="big-brothers-button primary" href="/">Return to Big Brothers ↗</Link></section></main>;

  return <main className="receipt-page"><section className="receipt-card">
    <header className="receipt-brand"><span className="receipt-mark">BB</span><span><strong>BIG BROTHERS CAR WASH</strong><small>{receipt.locationName}</small></span></header>
    <p className="big-brothers-eyebrow">COMPLETED WASH · SECURE RECEIPT</p>
    <h1>Your wash receipt.</h1>
    <p className="receipt-reference">Reference <strong>{receipt.receiptRef}</strong></p>
    <div className="receipt-details">
      <div><span>Customer</span><strong>{receipt.customerName}</strong></div>
      <div><span>Phone</span><strong>{receipt.phone}</strong></div>
      <div><span>Vehicle</span><strong>{receipt.vehicleType}</strong></div>
      <div><span>Service</span><strong>{receipt.serviceName}</strong></div>
      <div><span>Completed</span><strong>{receipt.completedAt ? new Date(receipt.completedAt).toLocaleString("en-BW") : "Not recorded"}</strong></div>
    </div>
    <div className="receipt-total"><span>Final agreed wash charge</span><strong>BWP {receipt.amount.toFixed(2)}</strong><small>Voluntary tip: BWP {receipt.tipAmount.toFixed(2)}</small><small>Total recorded: BWP {(receipt.amount+receipt.tipAmount).toFixed(2)}</small><small>Payment method: {receipt.paymentMethod.replaceAll("-", " ")}</small><small>Payment status: {receipt.paymentStatus}</small></div>
    <p className="receipt-disclaimer">This receipt reflects the final charge and payment status recorded by staff. It is proof of payment only when the status says “paid”. This secure link expires {new Date(receipt.expiresAt).toLocaleDateString("en-BW")}.</p>
    <a className="big-brothers-button primary" href={"/api/receipts/" + encodeURIComponent(token) + "/pdf"}>Download PDF receipt ↗</a>
    <button className="big-brothers-button secondary" type="button" onClick={() => void claimJob()} disabled={claiming}>{claiming ? "Securing your account…" : "Claim this job with Google"}</button>
    {receipt.claimed && <p className="receipt-claim-note">This receipt has already been claimed. Sign in with the account that claimed it to view the job history.</p>}
    {claimMessage && <p className="big-brothers-notice pending" role="status">{claimMessage}</p>}
    <section className="receipt-next-booking receipt-review"><h2>How was your wash?</h2><p>Your feedback is optional and helps Big Brothers improve. Public display is separate and requires your permission; the team reviews it before anything appears publicly.</p>{reviewSubmitted ? <p className="big-brothers-notice success" role="status">{reviewMessage}</p> : <form className="receipt-review-form" onSubmit={submitReview}><label>Rating<select value={reviewRating} onChange={event=>setReviewRating(event.target.value)} required><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Could be better</option><option value="1">1 — Poor</option></select></label><label>Comment (optional)<textarea value={reviewComment} onChange={event=>setReviewComment(event.target.value)} maxLength={1000} rows={3} placeholder="What went well, or what could be improved?"/></label><label className="receipt-review-consent"><input type="checkbox" checked={reviewPublicConsent} onChange={event=>setReviewPublicConsent(event.target.checked)}/> I give permission for this review to be considered for public display after moderation. My phone number and receipt link will never be displayed.</label><button type="submit" className="big-brothers-button primary" disabled={reviewBusy}>{reviewBusy?"Sending review…":"Send feedback"}</button>{reviewMessage&&<p className="big-brothers-notice pending" role="status">{reviewMessage}</p>}</form>}</section>
    <section className="receipt-next-booking receipt-photo-submission"><h2>Share your freshly washed car</h2><p>Want to show off the result? You can send one photo for staff moderation. It stays out of the public feed unless the team approves it.</p>{photoSubmitted?<p className="big-brothers-notice success" role="status">{photoMessage}</p>:<form className="receipt-review-form" onSubmit={submitPhoto}><label>Photo title<input value={photoTitle} onChange={event=>setPhotoTitle(event.target.value)} required maxLength={120} placeholder="e.g. My freshly washed SUV"/></label><label>Short caption (optional)<textarea value={photoDescription} onChange={event=>setPhotoDescription(event.target.value)} maxLength={500} rows={2} placeholder="Anything you'd like to share"/></label><label>Choose photo<input type="file" accept="image/*" required onChange={event=>setPhotoFile(event.target.files?.[0]||null)}/><small>Images only, maximum 8 MB.</small></label><label className="receipt-review-consent"><input type="checkbox" checked={photoConsent} onChange={event=>setPhotoConsent(event.target.checked)}/> I confirm I have permission to share this image and agree it may be considered for public display after moderation.</label><button type="submit" className="big-brothers-button primary" disabled={photoBusy}>{photoBusy?"Uploading…":"Submit photo for review"}</button>{photoMessage&&<p className="big-brothers-notice pending" role="status">{photoMessage}</p>}</form>}</section>
    <section className="receipt-next-booking"><h2>Plan your next wash</h2><p>Two simple follow-up windows, about 2 and 3 weeks after this wash. Choose a time from the admin-configured slots; the team confirms availability. Weather forecasts this far ahead are not reliable, so check the current G-West weather guide nearer the day.</p><div className="receipt-next-booking-options">{suggestedDates.map((date,index)=><Link key={date} className="big-brothers-button secondary" href={"/?journey=book&preferredDate="+date+"#request"}>{index===0?"In about 2 weeks":"In about 3 weeks"} · {new Date(date+"T12:00:00").toLocaleDateString("en-BW",{day:"numeric",month:"short"})} ↗</Link>)}</div><Link className="receipt-next-step" href="/?journey=book#request">Choose another date ↗</Link></section>
  </section></main>;
}
