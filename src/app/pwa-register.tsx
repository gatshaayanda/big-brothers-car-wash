/* eslint-disable react/no-unescaped-entities */
"use client";

import { useEffect, useRef, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function PwaRegister() {
  const [offline, setOffline] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installCardDismissed, setInstallCardDismissed] = useState(false);
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const reloadForUpdate = useRef(false);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const online = () => {
      setOffline(false);
      setReconnecting(true);
      window.setTimeout(() => setReconnecting(false), 1200);
    };
    const offlineNow = () => {
      setReconnecting(false);
      setOffline(true);
    };
    // Match Africhiko: intercept Chrome's automatic banner and retain the
    // real browser event for the branded Install button to invoke.
    const installPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstallCardDismissed(false);
      setInstallable(true);
    };

    window.addEventListener("online", online);
    window.addEventListener("offline", offlineNow);
    window.addEventListener("beforeinstallprompt", installPrompt);

    let registration: ServiceWorkerRegistration | null = null;
    const inspect = () => {
      if (registration?.waiting && navigator.serviceWorker.controller) setUpdateReady(registration.waiting);
    };
    const register = async () => {
      if (!( "serviceWorker" in navigator)) return;
      try {
        registration = await navigator.serviceWorker.register("/sw.js");
        inspect();
        registration.addEventListener("updatefound", () => {
          const worker = registration?.installing;
          if (!worker) return;
          worker.addEventListener("statechange", inspect);
        });
        await registration.update();
        inspect();
      } catch {}
    };

    void register();
    const controllerChange = () => { if (reloadForUpdate.current) window.location.reload(); };
    navigator.serviceWorker?.addEventListener("controllerchange", controllerChange);

    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offlineNow);
      window.removeEventListener("beforeinstallprompt", installPrompt);
      navigator.serviceWorker?.removeEventListener("controllerchange", controllerChange);
    };
  }, []);

  async function install() {
    const prompt = deferredPrompt;
    if (!prompt) return;
    // Invoke the genuine browser prompt directly from the customer's click.
    await prompt.prompt();
    await prompt.userChoice;
    setDeferredPrompt(null);
    setInstallable(false);
  }

  function applyUpdate() {
    reloadForUpdate.current = true;
    if (updateReady) {
      try {
        updateReady.postMessage({ type: "SKIP_WAITING" });
      } catch {}
    }
    window.setTimeout(() => {
      if (reloadForUpdate.current) window.location.reload();
    }, 1800);
  }

  return <>
    {offline && <div className="offlineBanner" role="status" aria-live="polite"><span aria-hidden="true">⚡</span> Offline · The service demo saves orders and admin edits locally on this device. Firebase-backed routes need a connection.</div>}
    {!offline && reconnecting && <div className="offlineBanner reconnectingBanner" role="status" aria-live="polite"><span aria-hidden="true">↻</span> Reconnected · Big Brothers Car Wash can reach the network again. Saved requests remain on this device until synced.</div>}
    {installable && !installCardDismissed && <aside className="big-brothers-install-card" aria-label="Install Big Brothers Car Wash">
      <div className="big-brothers-install-brand"><span className="big-brothers-install-mark" aria-hidden="true">V</span><span><strong>VULA'S CAR WASH</strong><small>WASH · CARE · GO</small></span></div>
      <button className="big-brothers-install-close" type="button" aria-label="Dismiss install prompt" onClick={() => setInstallCardDismissed(true)}>×</button>
      <button className="big-brothers-install-action" type="button" onClick={() => void install()}>Install Big Brothers Car Wash <span aria-hidden="true">↗</span></button>
    </aside>}
    {updateReady && <div className="pwaUpdate" role="status" aria-live="polite"><div><strong>Big Brothers Car Wash update is ready</strong><span>Refresh when you are ready.</span></div><button type="button" className="button buttonPrimary" onClick={applyUpdate}>Refresh</button></div>}
  </>;
}
