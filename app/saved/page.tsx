"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readSavedFinds, removeSavedFind, savedFindsChangedEvent, type SavedFind } from "@/lib/saved-finds";
import { trackPlugJourney } from "@/lib/firebase/journey-analytics";

function money(value: number) {
  return new Intl.NumberFormat("en-BW", { style: "currency", currency: "BWP", maximumFractionDigits: 2 }).format(value);
}

export default function SavedFindsPage() {
  const [items, setItems] = useState<SavedFind[]>([]);
  useEffect(() => {
    const refresh = () => setItems(readSavedFinds());
    refresh();
    window.addEventListener(savedFindsChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(savedFindsChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return <main className="orderPage"><div className="orderWrap">
    <div className="orderHeader"><Link href="/" className="logo"><span className="logoMark">P</span><span>ITERATION 13</span></Link><nav className="accountTopNav"><Link href="/account" className="button buttonLight">My Plug</Link><Link href="/#featured" className="button buttonPrimary">Browse finds</Link></nav></div>
    <section className="orderCard accountHome" style={{ maxWidth: 980, margin: "0 auto" }}>
      <div className="accountHero"><div><span className="kicker">YOUR SAVED EDIT</span><h1>Keep your finds close.</h1><p>Saved items stay here on this browser, even if Frank later removes them from the live storefront.</p></div><span className="accountStatus">{items.length} saved</span></div>
      {items.length === 0 ? <div className="emptyState"><h2>No saved finds yet.</h2><p>Browse the edit and tap Save on anything you want to come back to.</p><Link href="/#featured" className="button buttonPrimary">Explore featured finds ↗</Link></div> :
        <div className="plugSavedGrid">{items.map(item => <article className="plugProductCard" key={item.id}>
          <div className={"plugProductImage " + (item.imageUrl ? "" : "plugProductImageMissing")}>{item.imageUrl ? <img src={item.imageUrl} alt={item.title} loading="lazy" /> : <span>THE<br />PLUG</span>}{item.type === "deal" && <span className="plugProductBadge">SAVED OFFER</span>}</div>
          <div className="plugProductMeta"><span>{item.category || (item.type === "deal" ? "SAVED OFFER" : "SAVED FIND")}</span>{typeof item.price === "number" && <strong>{money(item.price)}</strong>}</div>
          <h3>{item.title}</h3>{item.description && <p>{item.description}</p>}
          <p className="orderTruth">This is your saved snapshot, not a live stock guarantee. Frank confirms current availability and price.</p>
          <div className="plugProductExpandedActions"><Link className="plugProductExpandedAction" href={"/request?product=" + encodeURIComponent(item.title) + (typeof item.price === "number" ? "&price=" + encodeURIComponent(String(item.price)) : "") + "&itemType=" + item.type} onClick={() => void trackPlugJourney("product_request_clicked", { productLabel: item.title, itemType: item.type, category: item.category || "Other", source: "saved_finds" })}>Ask Frank about this ↗</Link><button type="button" className="plugProductShareAction" onClick={() => { removeSavedFind(item.id); setItems(readSavedFinds()); void trackPlugJourney("product_unbookmarked", { productLabel: item.title, itemType: item.type, category: item.category || "Other", source: "saved_finds" }); }}>Remove saved item</button></div>
        </article>)}</div>}
      <div className="requestMemberUtility"><span>KEEP THE LOOP GOING</span><div className="actions"><Link className="button buttonLight" href="/request">Request another find ↗</Link><Link className="button buttonLight" href="/#community">Explore the feed ↗</Link><Link className="button buttonLight" href="/account">My Plug & replies ↗</Link></div></div>
    </section>
  </div></main>;
}
