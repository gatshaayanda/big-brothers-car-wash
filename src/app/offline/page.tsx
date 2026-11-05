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
          <h3>Reconnect to finish syncing</h3>
          <p>Walk-in, booking and fleet requests saved while offline stay on this device until a connection returns. Big Brothers only receives them after the shared system confirms the save.</p>
          <Link className="text-link" href="/">Return to the wash bay ↗</Link>
        </article>
      </div>
      <p className="big-brothers-notice pending">Offline: the cached homepage and racing practice game can work on this device. Walk-in, booking and fleet drafts saved here can sync after reconnection. Live prices, shared queue updates, account data, current weather and booking availability need a connection. A saved request is not visible to staff until the server confirms it; a booking remains pending until the team confirms it.</p>
      <p className="big-brothers-actions">
        <Link className="big-brothers-button primary" href="/">Return to Big Brothers Car Wash ↗</Link>
      </p>
    </section>
  </main>;
}
