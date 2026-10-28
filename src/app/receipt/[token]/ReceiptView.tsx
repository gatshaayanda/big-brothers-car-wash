"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getIdToken, GoogleAuthProvider, linkWithPopup, signInWithPopup, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase/client";

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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/receipts/" + encodeURIComponent(token), { cache: "no-store" })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { receipt?: Receipt; error?: string };
        if (!response.ok || !data.receipt) throw new Error(data.error || "This receipt link is unavailable.");
        if (!cancelled) {
          setReceipt(data.receipt);
          const formatDate = (date: Date) => { const year = date.getFullYear(); const month = String(date.getMonth()+1).padStart(2,"0"); const day = String(date.getDate()).padStart(2,"0"); return year+"-"+month+"-"+day; };
          setSuggestedDates([21,28].map(days => { const date = new Date(); date.setDate(date.getDate()+days); return formatDate(date); }));
        }
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "This receipt link is unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

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
      <div><span>Registration</span><strong>{receipt.vehicleRegistration || "Not supplied"}</strong></div>
      <div><span>Service</span><strong>{receipt.serviceName}</strong></div>
      <div><span>Completed</span><strong>{receipt.completedAt ? new Date(receipt.completedAt).toLocaleString("en-BW") : "Not recorded"}</strong></div>
    </div>
    <div className="receipt-total"><span>Final agreed wash charge</span><strong>BWP {receipt.amount.toFixed(2)}</strong><small>Voluntary tip: BWP {receipt.tipAmount.toFixed(2)}</small><small>Total recorded: BWP {(receipt.amount+receipt.tipAmount).toFixed(2)}</small><small>Payment method: {receipt.paymentMethod.replaceAll("-", " ")}</small><small>Payment status: {receipt.paymentStatus}</small></div>
    <p className="receipt-disclaimer">This receipt reflects the final charge and payment status recorded by staff. It is proof of payment only when the status says “paid”. This secure link expires {new Date(receipt.expiresAt).toLocaleDateString("en-BW")}.</p>
    <a className="big-brothers-button primary" href={"/api/receipts/" + encodeURIComponent(token) + "/pdf"}>Download PDF receipt ↗</a>
    <button className="big-brothers-button secondary" type="button" onClick={() => void claimJob()} disabled={claiming}>{claiming ? "Securing your account…" : "Claim this job with Google"}</button>
    {receipt.claimed && <p className="receipt-claim-note">This receipt has already been claimed. Sign in with the account that claimed it to view the job history.</p>}
    {claimMessage && <p className="big-brothers-notice pending" role="status">{claimMessage}</p>}
    <section className="receipt-next-booking"><h2>Plan your next wash</h2><p>Based on today’s visit, here are two suggested dates—about three and four weeks from when you opened this receipt. Choose a time on the booking form; staff will confirm real availability.</p><div className="receipt-next-booking-options">{suggestedDates.map((date,index)=><Link key={date} className="big-brothers-button secondary" href={"/?journey=book&preferredDate="+date+"#request"}>{index===0?"In about 3 weeks":"In about 4 weeks"} · {new Date(date+"T12:00:00").toLocaleDateString("en-BW",{day:"numeric",month:"short"})} ↗</Link>)}</div><Link className="receipt-next-step" href="/?journey=book#request">Choose another date ↗</Link></section>
  </section></main>;
}
