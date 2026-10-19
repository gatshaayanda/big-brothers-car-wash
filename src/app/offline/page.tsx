import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="orderPage">
      <div className="orderWrap">
        <div className="orderHeader">
          <Link href="/" className="logo"><span className="logoMark">P</span><span>Iteration 13</span></Link>
        </div>
        <section className="orderCard confirm">
          <div className="confirmIcon">📶</div>
          <span className="kicker">Offline mode</span>
          <h1>Iteration 13 is still here.</h1>
          <p>The app shell and pages already loaded may remain available on this device. Displayed information may be out of date.</p>
          <p>The service-order demo stores requests, service edits and announcements in this browser, so those demo changes remain on this device while offline. They are not shared with another device or synced to a server. Firebase-backed routes and other server-dependent actions still need a connection.</p>
          <div className="actions centered">
            <Link className="button buttonPrimary" href="/request">Try customer journey</Link>
            <Link className="button buttonLight" href="/">Open home</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
