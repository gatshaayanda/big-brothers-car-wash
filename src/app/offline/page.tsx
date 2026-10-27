/* eslint-disable react/no-unescaped-entities */
import Link from "next/link";
export default function OfflinePage() {
  return <main className="vula"><div className="big-brothers-status"><span className="status-dot"/>Offline mode</div><section className="big-brothers-section"><p className="big-brothers-eyebrow">CONNECTION PAUSED</p><h1 style={{fontSize:"clamp(40px,7vw,72px)"}}>Still here.<br/>Not yet synced.</h1><p>Your previously loaded app shell remains available. Requests saved while offline stay on this device until a connection returns. They are not visible to Vula's team and are not confirmed bookings until the server accepts them.</p><p><Link className="big-brothers-button primary" href="/">Return to Big Brothers Car Wash ↗</Link></p></section></main>;
}
