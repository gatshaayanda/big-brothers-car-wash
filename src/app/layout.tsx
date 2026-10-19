import type {Metadata,Viewport} from "next";
import {headers} from "next/headers";
import {Analytics} from "@vercel/analytics/next";
import {SpeedInsights} from "@vercel/speed-insights/next";
import PwaRegister from "@/app/pwa-register";
import Script from "next/script";
import "./globals.css"; import "./pwa.css";
const siteUrl=process.env.NEXT_PUBLIC_BASE_URL||"https://iteration13.vercel.app";
const EMBEDDED_BROWSER_PATTERN=/WhatsApp|Instagram|FBAN|FBAV|Messenger|Line[/]|Twitter|TikTok|Snapchat/i;
export const metadata:Metadata={metadataBase:new URL(siteUrl),title:{default:"Iteration 13 | Service Studio",template:"%s | Iteration 13"},description:"A mobile-first service-order demo with installation guidance and offline-aware behavior.",applicationName:"Iteration 13",keywords:["Iteration 13","PWA","mobile app","offline","installation"],alternates:{canonical:"/"},openGraph:{type:"website",url:siteUrl,siteName:"Iteration 13",title:"Iteration 13 | Service Studio",description:"A reliable service-order demo, online and offline."},twitter:{card:"summary",title:"Iteration 13 | PWA Prototype",description:"A reliable app experience, online and offline."},icons:{icon:[{url:"/iteration13-icon-192.png",sizes:"192x192",type:"image/png"},{url:"/iteration13-icon-512.png",sizes:"512x512",type:"image/png"},{url:"/iteration13-icon.svg",type:"image/svg+xml"}],apple:{url:"/iteration13-icon-180.png",sizes:"180x180",type:"image/png"}},manifest:"/manifest.webmanifest",appleWebApp:{capable:true,title:"Iteration 13",statusBarStyle:"default"}};
export const viewport:Viewport={themeColor:"#155eef",colorScheme:"light"};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const requestHeaders=await headers();
 const userAgent=requestHeaders.get("user-agent")||"";
 const requestedWith=requestHeaders.get("x-requested-with")||"";
 // A social referrer does not prove this browser is embedded: Chrome opened from WhatsApp
 // must not be trapped in the in-app-browser install gate.
 const embedded=EMBEDDED_BROWSER_PATTERN.test(userAgent)
   || (/Android/i.test(userAgent)&&/\bwv\b/i.test(userAgent))
   || /^(com\.whatsapp|com\.instagram\.android|com\.facebook\.katana|com\.facebook\.lite|com\.facebook\.orca)$/i.test(requestedWith);
 const android=/Android/i.test(userAgent);
 return <html lang="en"><body style={embedded?{overflow:"hidden"}:undefined}><Script id="iteration13-early-install-capture" strategy="beforeInteractive">{`
(function () {
  window.addEventListener("beforeinstallprompt", function (event) {
    var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (standalone || window.__iteration13PwaListenerReady === true) return;
    event.preventDefault();
    window.__iteration13InstallPrompt = event;
  });
})();
`}</Script><PwaRegister initialEmbedded={embedded} initialAndroid={android}/>{children}<Analytics/><SpeedInsights/></body></html>
}
