"use client";
import Link from "next/link";
import {getIdToken,GoogleAuthProvider,browserLocalPersistence,linkWithPopup,onAuthStateChanged,setPersistence,signInWithCredential,signInWithPopup,signOut,type User} from "firebase/auth";
import {useEffect,useState} from "react";
import {auth,hasFirebaseWebConfig} from "@/lib/firebase/client";
import NotificationSettings from "@/components/NotificationSettings";
import CustomerConversations from "@/components/CustomerConversations";
import {getCustomerProfile,isAdminUser,saveCustomerProfile,type CustomerProfile} from "@/lib/firebase/data";
import {subscribeToCustomerPlugRequests,type PlugRequest} from "@/lib/firebase/plug-data";
import MemberCircle from "@/components/MemberCircle";
import MemberPrivacySettings from "@/components/MemberPrivacySettings";
import MemberActivityFeed from "@/components/MemberActivityFeed";

function authMessage(error:unknown){
 const code=typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code):"";
 if(code==="auth/popup-closed-by-user")return "Google sign-in was cancelled.";
 if(code==="auth/credential-already-in-use"||code==="auth/account-exists-with-different-credential")return "That Google account belongs to a separate Iteration 13 account. The histories have not been merged, and your current session is unchanged. Keep this session open; Iteration 13 cannot safely combine those histories automatically.";
 if(code==="auth/popup-blocked")return "Your browser blocked the Google sign-in window. Allow pop-ups for Iteration 13 and try again.";
 if(code==="auth/unauthorized-domain")return "Google sign-in is not enabled for this website yet. Try again later; your current session has not been changed.";
 if(code==="auth/configuration-not-found"||code==="auth/operation-not-allowed")return "Google sign-in is not available yet. Iteration 13's sign-in setup is incomplete. Try again later.";
 if(code.startsWith("auth/")||code.startsWith("app/"))return "Google sign-in could not be completed because Iteration 13’s sign-in setup is not ready. Try again later; your current session has not been changed.";
 return "Google sign-in could not be completed. Please try again later. Your current session has not been changed.";
}
const terminal=new Set(["Delivered","Collected","Cancelled"]);

export default function AccountPage(){
 const[user,setUser]=useState<User|null>(null),[profile,setProfile]=useState<CustomerProfile|null>(null),[requests,setRequests]=useState<PlugRequest[]>([]),[busy,setBusy]=useState(false),[authReady,setAuthReady]=useState(false),[message,setMessage]=useState(""),[showPostSubmitSetup,setShowPostSubmitSetup]=useState(false);


 useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.has("submitted")){setMessage("Your request is saved. the team will review it and confirm availability, final price and timing. Nothing is ordered or charged yet.");setShowPostSubmitSetup(true)}},[]);
 useEffect(()=>{
  let stopRequests=()=>{};
  let stopAuth=()=>{};
  let disposed=false;
  const start=async()=>{
   if(hasFirebaseWebConfig){
    try{await setPersistence(auth,browserLocalPersistence)}catch{if(!disposed)setMessage("This browser could not confirm saved sign-in. Keep this browser session available while using Iteration 13.")}
   }
   if(disposed)return;
   stopAuth=onAuthStateChanged(auth,async next=>{
    stopRequests();stopRequests=()=>{};
    if(next&&await isAdminUser(next.uid)){
     await signOut(auth);
     if(disposed)return;
     setUser(null);setProfile(null);setRequests([]);setAuthReady(true);return;
    }
    if(disposed)return;
    setUser(next);
    if(next){
     const saved=await getCustomerProfile(next.uid).catch(()=>null);
     if(disposed)return;
     setProfile(saved??{uid:next.uid,name:next.displayName??"",email:next.email??"",phone:"",preferredDeliveryLocation:"",notes:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
     stopRequests=subscribeToCustomerPlugRequests(next.uid,setRequests,error=>setMessage(error.message));
    }else{setProfile(null);setRequests([])}
    setAuthReady(true);
   });
  };
  void start();
  return()=>{disposed=true;stopRequests();stopAuth()};
 },[]);

 async function google(){
  if(!authReady||busy)return;
  if(!hasFirebaseWebConfig){setMessage("Google sign-in is not available yet because Iteration 13's member sign-in setup is incomplete. Try again later; your current session has not been changed.");return;}
  setBusy(true);setMessage("");
  try{
   const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:"select_account"});
   let recoveredExistingAccount=false;
   if(user?.isAnonymous){
    try{
     const linked=await linkWithPopup(user,provider);
     const saved=await getCustomerProfile(linked.user.uid);
     if(saved)setProfile(saved);
    }catch(error){
     const code=typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code):"";
     if(code!=="auth/credential-already-in-use"&&code!=="auth/account-exists-with-different-credential")throw error;
     // The Google identity already has its own UID. Sign into that existing account
     // instead of trapping the customer in an anonymous-session linking error.
     // Do not claim or attempt to merge the separate histories.
     const credential=GoogleAuthProvider.credentialFromError(error as import("firebase/app").FirebaseError);
     if(!credential)throw error;
     const result=await signInWithCredential(auth,credential);
     const now=new Date().toISOString();
     const saved=await getCustomerProfile(result.user.uid);
     if(saved)setProfile(saved);
     else{
      const nextProfile={uid:result.user.uid,name:result.user.displayName??"",email:result.user.email??"",phone:"",preferredDeliveryLocation:"",notes:"",createdAt:now,updatedAt:now};
      await saveCustomerProfile(nextProfile);setProfile(nextProfile);
     }
     recoveredExistingAccount=true;
    }
   }
   else if(!user){const result=await signInWithPopup(auth,provider);const now=new Date().toISOString();const saved=await getCustomerProfile(result.user.uid);if(saved)setProfile(saved);else{const nextProfile={uid:result.user.uid,name:result.user.displayName??"",email:result.user.email??"",phone:"",preferredDeliveryLocation:"",notes:"",createdAt:now,updatedAt:now};await saveCustomerProfile(nextProfile);setProfile(nextProfile)}}
   setMessage(recoveredExistingAccount?"You’re signed in to your existing Iteration 13 Google account. The separate guest-session history has not been merged.":"Your Iteration 13 account is connected.");
   const destination=new URLSearchParams(window.location.search).get("next");
   if(destination&&destination.startsWith("/")&&!destination.startsWith("//"))window.location.assign(destination);
  }catch(error){setMessage(authMessage(error))}finally{setBusy(false)}
 }

 async function approveQuote(request:PlugRequest){
  if(!user||busy)return;
  setBusy(true);setMessage("");
  try{
   const idToken=await getIdToken(user);
   const response=await fetch("/api/sourcing-request/approve-quote",{method:"POST",headers:{Authorization:"Bearer "+idToken,"Content-Type":"application/json"},body:JSON.stringify({requestId:request.id})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"We could not record your approval. Please try again.");
   setMessage(result.alreadyApproved?"You already approved this exact quote.":"Quote approval saved. the team can now confirm the deposit and sourcing steps.");
  }catch(error){setMessage(error instanceof Error?error.message:"We could not record your approval. Please try again.");}
  finally{setBusy(false);}
 }

 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!user||!profile)return;setBusy(true);setMessage("");
  const form=new FormData(event.currentTarget);
  const next={...profile,name:String(form.get("name")??"").trim(),email:String(form.get("email")??"").trim(),phone:String(form.get("phone")??"").trim(),preferredDeliveryLocation:String(form.get("preferredDeliveryLocation")??"").trim(),notes:String(form.get("notes")??"").trim(),updatedAt:new Date().toISOString()};
  try{await saveCustomerProfile(next);setProfile(next);setMessage("Your Iteration 13 details are saved.")}catch{setMessage("We could not save your details. Nothing was changed; please try again.")}finally{setBusy(false)}
 }

 return <main className="orderPage"><div className="orderWrap">
  <div className="orderHeader"><Link href="/" className="logo"><span className="logoMark">P</span><span>ITERATION 13</span></Link><nav aria-label="My requests navigation" className="accountTopNav"><Link href="/#featured" className="button buttonLight">Finds</Link><Link href="#profile" className="button buttonLight">Settings</Link><Link href="/request" className="button buttonPrimary">Request a product</Link></nav></div>
  <section className="orderCard accountHome" style={{maxWidth:920,margin:"0 auto"}}>
   <div className="accountHero"><div><span className="kicker">MY ITERATION 13</span><h1>Your requests.</h1><p>Track sourcing, talk to the team and keep your next finds in one place.</p></div>{user&&profile&&<span className="accountStatus">{user.isAnonymous?"Guest session":"Google connected"}</span>}</div>
   {(!user||user.isAnonymous)&&<section id="connect" className="accountConnect accountConnectPrimary"><div><strong>{user?.isAnonymous?"Keep your history and set up your circle.":"Already have a Plug account?"}</strong><p>{user?.isAnonymous?"Connecting Google is optional, but helps preserve this session’s request history and private conversations across devices.":"Continue with Google to reopen an existing account and its saved history. New to Iteration 13? Start a request first; your private session is created only when you submit."}</p>{!hasFirebaseWebConfig&&<p className="notice" role="status">Iteration 13 cannot connect or save requests in this deployment yet. Try again later; nothing has been sent.</p>}</div><div className="actions"><button className="googleSignInButton" type="button" onClick={()=>void google()} disabled={busy||!authReady||!hasFirebaseWebConfig}><span>{!authReady?"Restoring your session…":busy?"Connecting…":user?.isAnonymous?"Connect Google":"Continue with Google"}</span></button><Link className="button buttonLight" href="/request">Start a request</Link></div></section>}





   {user&&profile&&<>
    {requests.length===0?<article className="feedEmpty"><strong>Nothing here yet.</strong><p>Found something? Send it to the team and your request will show up here.</p><Link className="button buttonPrimary" href="/request">Start a request →</Link></article>:<section className="accountSection"><div className="panelHeading accountRequestsHeading"><div><span className="kicker">REQUESTS · {requests.length}</span><h2>Your sourcing requests.</h2></div><Link className="button buttonPrimary" href="/request">New request +</Link></div><div className="feedList">{requests.map(request=>{const complete=terminal.has(request.status);const quote=request.quotedPrice!==undefined?" · Quote P"+request.quotedPrice.toFixed(2):"";return <article className="feedItem" key={request.id}><div className="feedMarker">{complete?"✓":"•"}</div><div className="feedBody"><div className="feedTop"><strong>{request.status}</strong><small>{new Date(request.updatedAt).toLocaleString()}</small></div><p>{request.product}{request.size?" · "+request.size:""}{request.colour?" · "+request.colour:""}{quote}</p><div className="feedActions"><span>{request.depositPaid!==undefined&&request.depositRequired!==undefined?"Deposit P"+request.depositPaid.toFixed(2)+" / P"+request.depositRequired.toFixed(2):"No deposit recorded yet"}</span><Link className="button buttonLight" href={"/requests/"+request.id}>Track request</Link></div>{request.quotedPrice!==undefined&&["Quote Ready","Awaiting Deposit"].includes(request.status)&&request.customerApprovedPrice!==request.quotedPrice&&<div className="feedActions"><p className="orderTruth">Review the confirmed quote of P{request.quotedPrice.toFixed(2)}. Nothing is charged by approving it.</p><button className="button buttonPrimary" type="button" disabled={busy} onClick={()=>void approveQuote(request)}>{busy?"Saving approval…":"Approve this quote"}</button></div>}{request.customerApprovedAt&&request.customerApprovedPrice!==undefined&&request.customerApprovedPrice===request.quotedPrice&&<p className="orderTruth">You approved this quote on {new Date(request.customerApprovedAt).toLocaleString()}.</p>}</div></article>})}</div></section>}
   </>}
   {user&&<details className="memberSetup accountSetupDisclosure" open={showPostSubmitSetup}><summary className="accountSetupSummary"><span className="kicker">OPTIONAL SETUP</span><strong>Account, updates & your circle</strong><small>Connect Google, choose useful notifications and manage what you share.</small><b aria-hidden="true">＋</b></summary><div className="accountSetupBody"><div className="memberSetupHeading"><span className="kicker">MAKE IT YOURS</span><h2 id="member-setup-title">{user.isAnonymous?"Keep your Plug history. Make it yours.":"Your Plug, your way."}</h2><p>{user.isAnonymous?"One quick account connection helps keep this request and future conversations together when you change devices. You can set the rest up whenever you like.":"A few optional choices make Iteration 13 more useful: relevant updates, a feed that fits you and friends you choose to connect with."}</p></div><div className="memberSetupGrid">{user.isAnonymous?<><a href="#notifications" className="memberSetupCard memberSetupCardPrimary"><span>01 · START HERE</span><strong>Choose useful updates <b aria-hidden="true">↗</b></strong><small>Set up supported request and reply notifications on this device now. No Google connection needed to start.</small></a><a href="#connect" className="memberSetupCard"><span>02 · KEEP YOUR HISTORY</span><strong>Connect Google <b aria-hidden="true">↗</b></strong><small>Optional for now; recommended before changing devices so you can keep access to requests and private conversations.</small></a><div className="memberSetupCard memberSetupCardLater"><span>03 · YOUR CIRCLE</span><strong>Connect with friends</strong><small>Once your account is connected, invite friends and share only what you choose.</small></div><div className="memberSetupCard memberSetupCardLater"><span>04 · YOUR CHOICES</span><strong>Set interests & privacy</strong><small>After connecting your account, choose interests and what connected friends can see.</small></div></>:<><div className="memberSetupCard memberSetupCardComplete"><span>01 · ACCOUNT</span><strong>Account connected <b aria-hidden="true">✓</b></strong><small>Your request history and private conversations are linked to this Google account.</small></div><a href="#notifications" className="memberSetupCard"><span>02 · STAY IN THE LOOP</span><strong>Choose your alerts <b aria-hidden="true">↗</b></strong><small>Enable this device for supported request and reply updates when you want them.</small></a><a href="#friends" className="memberSetupCard"><span>03 · YOUR CIRCLE</span><strong>Invite a friend <b aria-hidden="true">↗</b></strong><small>Connect with people you trust, then share only the finds and interests you choose.</small></a><a href="#privacy" className="memberSetupCard"><span>04 · YOUR CHOICES</span><strong>Choose interests & privacy <b aria-hidden="true">↗</b></strong><small>Pick new drops, seasonal buys and loyalty updates; decide what connected friends can see.</small></a></>}</div><p className="memberSetupFootnote">Your sourcing requests, WhatsApp number, private messages and payment details are not shared with friends. Promotions and loyalty notices are sent only when relevant offers and supported update events exist.</p>{user&&profile&&<section className="accountSection accountSetupNotifications" id="notifications"><div className="panelHeading"><div><span className="kicker">PREFERENCES</span><h2>Notifications.</h2></div></div><NotificationSettings/></section>}{user&&!user.isAnonymous&&profile&&<><MemberPrivacySettings user={user} displayName={profile.name||user.displayName||"A Plug member"}/><MemberCircle user={user} displayName={profile.name||user.displayName||"A Plug member"}/></>}</div></details>}

   {user&&<CustomerConversations/>}


   {message&&<p className="notice" role="status">{message}</p>}

   {user&&!user.isAnonymous&&profile&&<><MemberActivityFeed user={user}/>
      <div className="accountBottomActions"><button className="button buttonLight" type="button" onClick={()=>void signOut(auth)}>Sign out</button><span className="orderTruth">Your account keeps your member activity together.</span></div></>}
   {user&&profile&&<details id="profile" className="accountDetails"><summary><span><strong>Your details</strong><small>Name, WhatsApp, delivery preference and notes</small></span><b>Edit</b></summary><form className="adminForm" onSubmit={save}><label>Name<input name="name" defaultValue={profile.name} required/></label><label>Email<input name="email" type="email" defaultValue={profile.email} readOnly={Boolean(user.email)} required={!user.isAnonymous}/>{user.isAnonymous&&<span>Optional until you connect Google.</span>}</label><label>WhatsApp / phone<input name="phone" type="tel" defaultValue={profile.phone} required/></label><label>Preferred delivery location <span>(optional)</span><input name="preferredDeliveryLocation" defaultValue={profile.preferredDeliveryLocation}/></label><label>Notes <span>(optional)</span><textarea name="notes" defaultValue={profile.notes}/></label><button className="button buttonPrimary" type="submit" disabled={busy}>{busy?"Saving…":"Save my details"}</button></form></details>}
   {user&&!user.isAnonymous&&<details id="external-links" className="accountDetails"><summary><span><strong>External links</strong><small>For when you actually need them</small></span><b>Open</b></summary><div className="adminForm"><p className="orderTruth">Your requests, conversations and Iteration 13 activity come first. Open these only when you want to leave Iteration 13.</p><p><a href="https://wa.me/c/26776411150" target="_blank" rel="noreferrer">WhatsApp catalogue ↗</a></p><p><a href="https://www.instagram.com/the.plugworldwidebw/" target="_blank" rel="noreferrer">Instagram ↗</a></p></div></details>}
   <p className="accountFooterNote orderTruth">{user?.isAnonymous?"Connect Google before changing devices if you want to keep access to your history.":"the team confirms the price and timing before you pay."}</p>
  </section>
 </div></main>;
}
