"use client";

import { useEffect, useState } from "react";

const assets = ["/videos/Left.mp4", "/videos/Right.mp4", "/videos/Bays.mp4"] as const;
const cacheName = "big-brothers-media-v2";

export default function OfflineWashMedia() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function inspect() {
      if (!("caches" in window)) return;
      try {
        const cache = await caches.open(cacheName);
        const matches = await Promise.all(assets.map(path => cache.match(new URL(path, window.location.origin).toString())));
        if (!cancelled && matches.every(Boolean)) {
          setSaved(true);
          setMessage("All 3 wash clips are saved and ready for offline playback on this device.");
        }
      } catch { /* Storage restrictions should not block the customer journey. */ }
    }
    void inspect();
    return () => { cancelled = true; };
  }, []);

  async function saveForOffline() {
    if (saving) return;
    if (!navigator.onLine) { setMessage("Connect to the internet to save the clips first. Any clips already saved remain available offline."); return; }
    if (!("caches" in window)) { setMessage("Offline media storage is not supported in this browser."); return; }
    setSaving(true);
    setSaved(false);
    setMessage("Checking device storage before downloading about 104 MB…");
    let count = 0;
    let received = 0;
    try {
      try { await navigator.storage?.persist?.(); } catch { /* Browser-controlled and optional. */ }
      const estimate = await navigator.storage?.estimate?.();
      if (typeof estimate?.quota === "number" && typeof estimate.usage === "number" && estimate.quota - estimate.usage < 104 * 1024 * 1024 * 1.08) {
        throw new Error("There may not be enough free browser storage. Free up at least 115 MB, then retry.");
      }
      const cache = await caches.open(cacheName);
      for (const path of assets) {
        const url = new URL(path, window.location.origin).toString();
        const existing = await cache.match(url);
        if (existing?.ok) {
          received += Number(existing.headers.get("content-length")) || 0;
          count += 1;
          setMessage("Checking saved clips · " + count + " of 3 ready");
          continue;
        }
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok || !response.body) throw new Error("Could not download " + path.split("/").pop() + ". Check the connection and retry.");
        const total = Number(response.headers.get("content-length")) || 0;
        let current = 0;
        const write = cache.put(url, response.clone());
        const reader = response.body.getReader();
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            current += part.value.byteLength;
            const percent = total > 0 ? Math.min(99, Math.round(current / total * 100)) : null;
            setMessage("Downloading " + path.split("/").pop() + (percent === null ? "" : " · " + percent + "%") + " · " + ((received + current) / (1024 * 1024)).toFixed(1) + " MB received");
          }
        } finally { reader.releaseLock(); }
        await write;
        const verified = await cache.match(url);
        if (!verified?.ok) throw new Error("The download finished but could not be verified in offline storage.");
        const verifiedSize = Number(verified.headers.get("content-length")) || current;
        if (total > 0 && verifiedSize !== total) throw new Error("The saved clip appears incomplete. Please retry while connected.");
        received += current;
        count += 1;
        setMessage("Saved " + count + " of 3 clips · " + (received / (1024 * 1024)).toFixed(1) + " MB received.");
      }
      const verified = await Promise.all(assets.map(path => cache.match(new URL(path, window.location.origin).toString())));
      if (!verified.every(Boolean)) throw new Error("One or more clips are missing from offline storage. Retry the download.");
      setSaved(true);
      setMessage("All 3 wash clips are saved and verified. They can now play offline on this device.");
    } catch (reason) {
      setSaved(false);
      setMessage(count + " of 3 clips saved. " + (reason instanceof Error ? reason.message : "Storage or download failed.") + " Previously saved clips are kept; connect again to retry.");
    } finally { setSaving(false); }
  }

  return <aside className="bb-offline-media" aria-label="Save Big Brothers wash videos for offline playback">
    <div><strong>Keep the wash-bay videos with you.</strong><p>Save the entrance and wash-bay clips once while online. They can then play offline on this device.</p>{message && <p role="status" aria-live="polite">{message}</p>}</div>
    <button type="button" className="big-brothers-button secondary" disabled={saving} onClick={() => void saveForOffline()}>{saving ? "Saving clips…" : saved ? "3 clips saved for offline ✓" : "Save 3 clips for offline · ~104 MB"}</button>
  </aside>;
}
