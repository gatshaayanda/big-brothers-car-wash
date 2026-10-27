/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";

export default function OfflinePage() {
  return <main className="vula">
    <div className="big-brothers-status"><span className="status-dot"/>Offline mode · Your app is still here</div>
    <section className="big-brothers-section">
      <p className="big-brothers-eyebrow">CONNECTION PAUSED</p>
      <h1 style={{fontSize:"clamp(40px,7vw,72px)"}}>Still here.<br/>Not yet synced.</h1>
      <p>Your connection dropped, but this app has a few useful things to try. What is available depends on what has already been cached on this device.</p>
      <div className="location-cards">
        <article>
          <span className="location-number">01</span>
          <h3>Prepare a wash request</h3>
          <p>Open the walk-in queue and complete the form. An offline request is saved on this device only; the team cannot see it until it syncs and the server confirms it.</p>
          <Link className="text-link" href="/#request">Open the walk-in queue ↗</Link>
        </article>
        <article>
          <span className="location-number">02</span>
          <h3>Take a racing break</h3>
          <p>Big Brothers Racing may still open if the game page and its assets have been cached from an earlier visit. Solo progress can be device-local.</p>
          <Link className="text-link" href="/games">Try Big Brothers Racing ↗</Link>
        </article>
        <article>
          <span className="location-number">03</span>
          <h3>Check your saved guides</h3>
          <p>Entrance and wash-bay videos play offline only after you choose “Save videos for offline” while connected. The download is about 104 MB.</p>
          <Link className="text-link" href="/#find-us">Open the location guide ↗</Link>
        </article>
      </div>
      <p className="big-brothers-notice pending">Live service prices, shared queue updates, account sync and current weather need a connection. A saved weather reading may be shown as out of date. A booking request is never confirmed just because it was saved here.</p>
      <p className="big-brothers-actions">
        <Link className="big-brothers-button primary" href="/">Return to Big Brothers Car Wash ↗</Link>
      </p>
    </section>
  </main>;
}
