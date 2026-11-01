"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {GoogleAuthProvider,linkWithPopup,onAuthStateChanged,signInAnonymously,signInWithPopup,type User} from "firebase/auth";
import {doc,getDoc,Timestamp,writeBatch} from "firebase/firestore";
import {auth,db,hasFirebaseWebConfig} from "@/lib/firebase/client";

type Invite={id:string;inviterUid:string;inviterName:string;status:string;expiresAt:Timestamp;recipientUid?:string};
export default function InviteAcceptance({inviteId}:{inviteId:string}){
 const[user,setUser]=useState<User|null>(null),[invite,setInvite]=useState<Invite|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[accepted,setAccepted]=useState(false),[existingAccountConflict,setExistingAccountConflict]=useState(false);
 useEffect(()=>{
  if(!hasFirebaseWebConfig){setMessage("The Plug account service is not ready in this browser. Nothing has been accepted.");setReady(true);return}
  return onAuthStateChanged(auth,async next=>{
   if(!next){try{await signInAnonymously(auth);return}catch{setMessage("We couldn’t open your private space. Try again in your normal browser.");setReady(true);return}}
   setUser(next);
   try{const snap=await getDoc(doc(db,"friendInvites",inviteId));if(!snap.exists()){setMessage("This invite is no longer available.");setReady(true);return}const data=snap.data() as Omit<Invite,"id">;const valid=data.status==="pending"&&data.expiresAt instanceof Timestamp&&data.expiresAt.toMillis()>Date.now();if(!valid){setAccepted(data.status==="accepted"&&data.recipientUid===next.uid);setMessage(data.status==="accepted"?"This invitation has already been accepted.":"This invitation has expired. Ask your friend for a new one.");}else if(data.inviterUid===next.uid){setMessage("This is your own invite. Send it to a friend to connect.");}else setInvite({id:snap.id,...data});}catch{setMessage("We couldn’t load this invite. Check your connection and try again.")}finally{setReady(true)}
  });
 },[inviteId]);
 async function acceptFor(confirmedUser:User){
  if(confirmedUser.isAnonymous){setMessage("Connect Google first to confirm your account.");return}
  setBusy(true);setMessage("");
  try{
   const inviteRef=doc(db,"friendInvites",inviteId);const snap=await getDoc(inviteRef);if(!snap.exists())throw new Error("This invite is no longer available.");
   const data=snap.data() as Omit<Invite,"id">;
   if(data.status!=="pending"||!(data.expiresAt instanceof Timestamp)||data.expiresAt.toMillis()<=Date.now())throw new Error("This invite has expired. Ask your friend for a new one.");
   if(data.inviterUid===confirmedUser.uid)throw new Error("You cannot accept your own invite.");
   const pair=[data.inviterUid,confirmedUser.uid].sort();const connectionId=pair.join("_");const connectionRef=doc(db,"friendConnections",connectionId);const existingConnection=await getDoc(connectionRef);const acceptedAt=new Date().toISOString();const batch=writeBatch(db);
   batch.update(inviteRef,{status:"accepted",recipientUid:confirmedUser.uid,acceptedAt});
   if(!existingConnection.exists())batch.set(connectionRef,{memberA:pair[0],memberB:pair[1],inviteId,createdAt:acceptedAt});
   await batch.commit();setInvite({...data,id:inviteId,status:"accepted",recipientUid:confirmedUser.uid});setAccepted(true);setMessage("You’re connected. Your friend’s activity will follow the privacy choices each of you makes.");
  }catch(error){setMessage(error instanceof Error?error.message:"The invitation could not be accepted. Please try again.")}finally{setBusy(false)}
 }
 async function switchToExistingAccount(){if(busy)return;setBusy(true);setMessage("");try{const result=await signInWithPopup(auth,new GoogleAuthProvider());setUser(result.user);await acceptFor(result.user);setExistingAccountConflict(false)}catch{setMessage("The existing Google account could not be used to accept this invitation. The invite is still pending.")}finally{setBusy(false)}}
 async function connectAndAccept(){
  if(!user||!user.isAnonymous||busy)return;
  setBusy(true);setMessage("");
  try{const linked=await linkWithPopup(user,new GoogleAuthProvider());setUser(linked.user);await acceptFor(linked.user)}catch(error){const code=typeof error==="object"&&error&&"code" in error?String((error as {code?:unknown}).code):"";setExistingAccountConflict(code==="auth/credential-already-in-use"||code==="auth/account-exists-with-different-credential");setMessage(code==="auth/credential-already-in-use"||code==="auth/account-exists-with-different-credential"?"That Google account already has a separate The Plug account. Your current session has not been merged; sign in to that account before accepting this invite.":code==="auth/popup-closed-by-user"?"Google connection was cancelled. The invitation is still pending.":"We couldn’t confirm this account. The invitation is still pending; try again.")}finally{setBusy(false)}
 }
 return <main className="orderPage"><div className="orderWrap"><div className="orderHeader"><Link href="/" className="logo"><span className="logoMark">P</span><span>THE PLUG</span></Link><Link href="/" className="button buttonLight">Back to the edit</Link></div><section className="orderCard" style={{maxWidth:680,margin:"0 auto"}}><span className="kicker">THE PLUG · FRIEND INVITE</span>{!ready?<><h1>Opening your invite…</h1><p>Getting your space ready.</p></>:accepted?<><h1>You’re in each other’s circle.</h1><p>The invitation is accepted. Your friend connection is established.</p><div className="actions"><Link href="/account#friends" className="button buttonPrimary">Open your circle ↗</Link><Link href="/" className="button buttonLight">Explore the edit</Link></div></>:invite?<><h1>{invite.inviterName||"A friend"} invited you.</h1><p>Connect your confirmed account to accept. You stay in control of what you share, and friend connections do not make private purchases public.</p><div className="requestMemberPerks"><article><span>YOUR CHOICE</span><strong>Choose visibility</strong><p>Private, friends-only and public sharing are separate choices.</p></article><article><span>NO SURPRISES</span><strong>Accept first</strong><p>Nothing connects until you confirm your account and accept.</p></article></div>{user?.isAnonymous?<button type="button" className="button buttonPrimary" onClick={()=>void connectAndAccept()} disabled={busy}>{busy?"Connecting…":"Connect Google & accept ↗"}</button>:<button type="button" className="button buttonPrimary" onClick={()=>void acceptFor(user!)} disabled={busy}>{busy?"Accepting…":"Accept invitation ↗"}</button>}{existingAccountConflict&&<div className="inviteExistingAccount"><p>Using an existing account replaces this temporary invite session; its unsaved session data is not merged.</p><button type="button" className="button buttonLight" onClick={()=>void switchToExistingAccount()} disabled={busy}>{busy?"Opening Google…":"Use existing Google account"}</button></div>}</>:<><h1>Let’s get you back in.</h1><p>This invitation could not be opened yet. It may have expired or your connection may be unavailable.</p><button type="button" className="button buttonPrimary" onClick={()=>window.location.reload()}>Try again ↻</button></>}{message&&<p className="notice" role="status">{message}</p>}</section></div></main>
}
