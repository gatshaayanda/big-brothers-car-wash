"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIdToken, GoogleAuthProvider, linkWithPopup, signInAnonymously, signInWithPopup, signOut } from "firebase/auth";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase/client";
import { saveAnnouncementPreferences, saveReminderPreferences } from "@/lib/firebase/big-brothers-data";
import { enableVulaPushNotifications } from "@/lib/firebase/big-brothers-notifications";

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
  const [weatherAdvice, setWeatherAdvice] = useState<Record<string, string>>({});
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState("");
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
          // Start the follow-up windows from opening this secure receipt link:
          // one option in week three and one in week four.
          const openedAt = new Date();
          const options = [15, 22].map(days => { const date = new Date(openedAt); date.setDate(date.getDate()+days); return formatDate(date); });
          setSuggestedDates(options);
          setWeatherAdvice(Object.fromEntries(options.map(date => [date, "Forecast not available this far ahead yet. We’ll check Gaborone weather closer to your chosen day."])));
          void fetch("https://api.open-meteo.com/v1/forecast?latitude=-24.6282&longitude=25.9231&daily=weather_code,precipitation_probability_max,temperature_2m_max&forecast_days=16&timezone=Africa%2FGaborone", { cache: "no-store" })
            .then(response => { if (!response.ok) throw new Error("Forecast unavailable"); return response.json(); })
            .then((forecast: { daily?: { time?: string[]; weather_code?: number[]; precipitation_probability_max?: number[]; temperature_2m_max?: number[] } }) => {
              const daily = forecast.daily;
              if (!daily?.time) return;
              const advice: Record<string, string> = {};
              options.forEach(date => {
                const index = daily.time!.indexOf(date);
                if (index < 0) return;
                const code = Number(daily.weather_code?.[index] ?? -1);
                const rain = Number(daily.precipitation_probability_max?.[index] ?? -1);
                const temp = Number(daily.temperature_2m_max?.[index] ?? NaN);
                const sky = code === 0 ? "Clear skies" : code <= 3 && code >= 0 ? "Some cloud" : code >= 95 ? "Thunderstorms possible" : code >= 51 ? "Rain or drizzle possible" : "Cloudier conditions";
                advice[date] = sky + (rain >= 0 ? " · " + rain + "% rain chance" : "") + (Number.isFinite(temp) ? " · " + Math.round(temp) + "°C high" : "");
              });
              setWeatherAdvice(current => ({ ...current, ...advice }));
            })
            .catch(() => {});

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
      setClaimMessage("Account secured. This completed wash is now linked to your signed-in account. Use My Account to manage future bookings and receipts.");
      setReceipt(current => current ? { ...current, claimed: true } : current);
    } catch (reason) {
      setClaimMessage(reason instanceof Error ? reason.message : "The job could not be claimed. Keep this receipt link and try again.");
    } finally {
      setClaiming(false);
    }
  }

  async function enableCustomerNotifications(kind: "reminders" | "offers") {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      setNotificationMessage("Secure your account with Google first. Then you can choose which updates you want.");
      return;
    }
    setNotificationBusy(true);
    setNotificationMessage("");
    try {
      await enableVulaPushNotifications(user.uid);
      if (kind === "reminders") await saveReminderPreferences(user.uid, true);
      else await saveAnnouncementPreferences(user.uid, true);
      setNotificationMessage(kind === "reminders"
        ? "Booking reminder preference saved and this device registered for push notifications."
        : "Special-offer preference saved and this device registered for push notifications. You can opt out later in your account.");
    } catch (reason) {
      setNotificationMessage(reason instanceof Error ? reason.message : "Notification settings could not be saved.");
    } finally {
      setNotificationBusy(false);
    }
  }

  if (loading) return <main className="receipt-page"><section className="receipt-card"><p>Loading secure receipt…</p></section></main>;
  if (error || !receipt) return <main className="receipt-page"><section className="receipt-card"><span className="receipt-mark">BB</span><p className="big-brothers-eyebrow">BIG BROTHERS CAR WASH</p><h1>Receipt unavailable.</h1><p>{error || "This receipt link is invalid or has expired."}</p><Link className="big-brothers-button primary" href="/">Return to Big Brothers ↗</Link></section></main>;

  return <main className="receipt-page"><section className="receipt-card">
    <header className="receipt-brand"><span className="receipt-mark">BB</span><span><strong>BIG BROTHERS CAR WASH</strong><small>{receipt.locationName}</small></span></header>
    <p className="big-brothers-eyebrow">COMPLETED WASH · SECURE RECEIPT</p>
    <h1>Your wash receipt.</h1>
    <p className="receipt-reference">Reference <strong>{receipt.receiptRef}</strong></p>
    <section className="receipt-next-booking receipt-account-claim"><h2>Make this wash yours</h2><p>Secure your Big Brothers account to keep this receipt with your wash history, manage future bookings and receive updates you choose.</p><button className="big-brothers-button primary" type="button" onClick={() => void claimJob()} disabled={claiming}>{claiming ? "Securing your account…" : receipt.claimed ? "Confirm / open my account ↗" : "Secure my account & save this wash ↗"}</button>{claimMessage && <p className="big-brothers-notice pending" role="status">{claimMessage}</p>}<Link className="receipt-next-step" href="/account">My Big Brothers Car Wash Account ↗</Link></section>
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
    {receipt.claimed && <p className="receipt-claim-note">This receipt is linked to a customer account. Sign in to that account to view your complete wash history.</p>}
    <section className="receipt-next-booking receipt-notification-choices"><h2>Choose the updates you want</h2><p>Optional: get booking reminders or hear about admin-published special offers. Your choice can be changed later in My Account.</p><div className="receipt-next-booking-options"><button className="big-brothers-button secondary" type="button" disabled={notificationBusy} onClick={() => void enableCustomerNotifications("reminders")}>Enable booking reminders</button><button className="big-brothers-button secondary" type="button" disabled={notificationBusy} onClick={() => void enableCustomerNotifications("offers")}>Hear about special offers</button></div>{notificationMessage && <p className="big-brothers-notice pending" role="status">{notificationMessage}</p>}</section>
    <section className="receipt-next-booking receipt-review"><h2>How was your wash?</h2><p>Your feedback is optional and helps Big Brothers improve. Public display is separate and requires your permission; the team reviews it before anything appears publicly.</p>{reviewSubmitted ? <p className="big-brothers-notice success" role="status">{reviewMessage}</p> : <form className="receipt-review-form" onSubmit={submitReview}><label>Rating<select value={reviewRating} onChange={event=>setReviewRating(event.target.value)} required><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Could be better</option><option value="1">1 — Poor</option></select></label><label>Comment (optional)<textarea value={reviewComment} onChange={event=>setReviewComment(event.target.value)} maxLength={1000} rows={3} placeholder="What went well, or what could be improved?"/></label><label className="receipt-review-consent"><input type="checkbox" checked={reviewPublicConsent} onChange={event=>setReviewPublicConsent(event.target.checked)}/> I give permission for this review to be considered for public display after moderation. My phone number and receipt link will never be displayed.</label><button type="submit" className="big-brothers-button primary" disabled={reviewBusy}>{reviewBusy?"Sending review…":"Send feedback"}</button>{reviewMessage&&<p className="big-brothers-notice pending" role="status">{reviewMessage}</p>}</form>}</section>
    <section className="receipt-next-booking receipt-photo-submission"><h2>Share your freshly washed car</h2><p>Want to show off the result? You can send one photo for staff moderation. It stays out of the public feed unless the team approves it.</p>{photoSubmitted?<p className="big-brothers-notice success" role="status">{photoMessage}</p>:<form className="receipt-review-form" onSubmit={submitPhoto}><label>Photo title<input value={photoTitle} onChange={event=>setPhotoTitle(event.target.value)} required maxLength={120} placeholder="e.g. My freshly washed SUV"/></label><label>Short caption (optional)<textarea value={photoDescription} onChange={event=>setPhotoDescription(event.target.value)} maxLength={500} rows={2} placeholder="Anything you'd like to share"/></label><label>Choose photo<input type="file" accept="image/*" required onChange={event=>setPhotoFile(event.target.files?.[0]||null)}/><small>Images only, maximum 8 MB.</small></label><label className="receipt-review-consent"><input type="checkbox" checked={photoConsent} onChange={event=>setPhotoConsent(event.target.checked)}/> I confirm I have permission to share this image and agree it may be considered for public display after moderation.</label><button type="submit" className="big-brothers-button primary" disabled={photoBusy}>{photoBusy?"Uploading…":"Submit photo for review"}</button>{photoMessage&&<p className="big-brothers-notice pending" role="status">{photoMessage}</p>}</form>}</section>
    <section className="receipt-next-booking"><h2>Pick your next wash window</h2><p>We’ve suggested one day in week three and another in week four from opening this link. The weather preview uses the real Gaborone forecast where it is available; forecasts further out are not reliable yet. Each option still checks the team’s configured hours and available capacity when you request a booking.</p><div className="receipt-next-booking-options">{suggestedDates.map((date,index)=><article className="receipt-date-suggestion" key={date}><span className="service-category">{index===0?"WEEK 3 · EARLIER OPTION":"WEEK 4 · LATER OPTION"}</span><strong>{new Date(date+"T12:00:00").toLocaleDateString("en-BW",{weekday:"long",day:"numeric",month:"short"})}</strong><p>{weatherAdvice[date] || "Checking the Gaborone forecast…"}</p><Link className="big-brothers-button secondary" href={"/?journey=book&preferredDate="+date+"#request"}>Choose this day ↗</Link></article>)}</div><Link className="receipt-next-step" href="/?journey=book#request">I’ll choose a different day or time ↗</Link></section>
  </section></main>;
}
