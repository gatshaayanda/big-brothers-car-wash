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
    const offlineNow = () => { setReconnecting(false); setOffline(true); };
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
      if (!("serviceWorker" in navigator)) return;
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
      } catch {
        // Keep the online app usable when service-worker registration is unavailable.
      }
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
    await prompt.prompt();
    await prompt.userChoice;
    setDeferredPrompt(null);
    setInstallable(false);
  }

  function applyUpdate() {
    reloadForUpdate.current = true;
    if (updateReady) {
      try { updateReady.postMessage({ type: "SKIP_WAITING" }); } catch {}
    }
    window.setTimeout(() => {
      if (reloadForUpdate.current) window.location.reload();
    }, 1800);
  }

  return <>
    {offline && <div className="offlineBanner" role="status" aria-live="polite">Offline · New requests stay on this device until the server confirms they have synced.</div>}
    {!offline && reconnecting && <div className="offlineBanner reconnectingBanner" role="status" aria-live="polite">Reconnected · Big Brothers Car Wash can reach the network again. Pending requests still need server confirmation.</div>}
    {installable && !installCardDismissed && <aside className="af-install-card" aria-label="Install Big Brothers Car Wash">
      <div className="af-install-brand"><span className="af-install-mark" aria-hidden="true">BB<span>✦</span></span><span><strong>BIG BROTHERS</strong><small>CAR WASH · G-WEST</small></span></div>
      <button className="af-install-close" type="button" aria-label="Dismiss install prompt" onClick={() => setInstallCardDismissed(true)}>×</button>
      <button className="af-install-action" type="button" onClick={() => void install()}>Install Big Brothers <span aria-hidden="true">↗</span></button>
    </aside>}
    {updateReady && <div className="pwaUpdate" role="status" aria-live="polite"><div><strong>Big Brothers Car Wash update is ready</strong><span>Refresh when you are ready.</span></div><button type="button" className="button buttonPrimary" onClick={applyUpdate}>Refresh</button></div>}
  </>;
}
