/* eslint-disable react/no-unescaped-entities */
"use client";

import { onAuthStateChanged, signInWithCustomToken, signOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase/client";
import "@/app/big-brothers.css";

function hasAdminRole(data: Record<string, unknown> | undefined) {
  return ["owner", "staff"].includes(String(data?.role ?? "").toLowerCase());
}

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [offline, setOffline] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [businessName, setBusinessName] = useState("Big Brothers Car Wash");

  useEffect(() => {
    const stopSettings = onSnapshot(doc(db, "businessSettings", "main"), snapshot => { const value = snapshot.data()?.businessName; if (typeof value === "string" && value.trim()) setBusinessName(value); });
    let stopAdmin: undefined | (() => void);
    const stopAuth = onAuthStateChanged(auth, next => {
      stopAdmin?.(); stopAdmin = undefined; setUser(next); setChecking(true); setOffline(false);
      if (!next) { setAuthorized(false); setChecking(false); return; }
      stopAdmin = onSnapshot(doc(db, "admins", next.uid), snapshot => {
        const allowed = snapshot.exists() && hasAdminRole(snapshot.data());
        setAuthorized(allowed); setChecking(false); setOffline(false);
        if (!allowed) void signOut(auth);
      }, () => { setOffline(true); setChecking(false); });
    });
    return () => { stopAdmin?.(); stopAuth(); stopSettings(); };
  }, []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/operations-login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ word })
      });
      const payload = await response.json() as { token?: string; error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error || "Staff sign-in failed.");
      const credential = await signInWithCustomToken(auth, payload.token);
      const admin = await new Promise<{ exists: boolean; data: () => Record<string, unknown> } | null>(resolve => {
        const stop = onSnapshot(doc(db, "admins", credential.user.uid), snapshot => {
          stop(); resolve({ exists: snapshot.exists(), data: () => snapshot.data() ?? {} });
        }, () => { stop(); resolve(null); });
      });
      if (!admin?.exists || !hasAdminRole(admin.data())) {
        setError("This account is not enabled for Vula staff operations.");
        await signOut(auth);
      } else { setAuthorized(true); setOffline(false); setWord(""); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Staff sign-in failed."); }
    finally { setBusy(false); }
  }

  if (checking) return <main className="vula"><section className="big-brothers-section"><p className="big-brothers-eyebrow">STAFF ACCESS</p><h1 style={{fontSize:"clamp(36px,6vw,58px)"}}>Checking access…</h1></section></main>;
  if (user && authorized) return <div className="adminAuthorized"><div className="big-brothers-status"><span className={"status-dot " + (!offline ? "online" : "")}/>{offline ? "Offline · staff data may be stale" : "Staff signed in"} · {user.email || "authorized staff"}<button style={{marginLeft:12}} onClick={() => void signOut(auth)}>Sign out</button></div>{children}</div>;

  return <main className="vula"><div className="big-brothers-status"><span className="status-dot online"/>{businessName} · Staff access</div><section className="big-brothers-section" style={{maxWidth:620,margin:"40px auto"}}><p className="big-brothers-eyebrow">STAFF ONLY</p><h1 style={{fontSize:"clamp(38px,6vw,62px)"}}>Operations sign in.</h1><p>Use the private staff access word. Do not share it with customers.</p><form className="admin-editor" onSubmit={signIn}><label>Staff access word<input type="password" value={word} onChange={event=>setWord(event.target.value)} required autoComplete="current-password"/></label><button className="big-brothers-button primary" disabled={busy}>{busy ? "Checking…" : "Enter staff workspace"}</button>{error&&<p role="alert" className="big-brothers-notice error">{error}</p>}</form></section></main>;
}
