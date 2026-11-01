"use client";
import {useEffect,useState} from "react";
import {addDoc,collection,deleteDoc,doc,onSnapshot,query,Timestamp,where} from "firebase/firestore";
import type {User} from "firebase/auth";
import {db} from "@/lib/firebase/client";
import {trackPlugJourney} from "@/lib/firebase/journey-analytics";

type InviteRecord={id:string;status:string;inviterName?:string;expiresAt?:Timestamp;createdAt?:string};
type Connection={id:string;memberA:string;memberB:string;createdAt?:string};
export default function MemberCircle({user,displayName}:{user:User;displayName:string}){
 const[invites,setInvites]=useState<InviteRecord[]>([]),[connectionsA,setConnectionsA]=useState<Connection[]>([]),[connectionsB,setConnectionsB]=useState<Connection[]>([]),[inviteUrl,setInviteUrl]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 useEffect(()=>{
  if(user.isAnonymous)return;
  const stopInvites=onSnapshot(query(collection(db,"friendInvites"),where("inviterUid","==",user.uid)),snap=>setInvites(snap.docs.map(d=>({id:d.id,...d.data()} as InviteRecord))),()=>setMessage("Invitations could not be loaded right now."));
  const stopA=onSnapshot(query(collection(db,"friendConnections"),where("memberA","==",user.uid)),snap=>setConnectionsA(snap.docs.map(d=>({id:d.id,...d.data()} as Connection))),()=>setMessage("Your friend list could not be loaded right now."));
  const stopB=onSnapshot(query(collection(db,"friendConnections"),where("memberB","==",user.uid)),snap=>setConnectionsB(snap.docs.map(d=>({id:d.id,...d.data()} as Connection))),()=>setMessage("Your friend list could not be loaded right now."));
  return()=>{stopInvites();stopA();stopB()};
 },[user]);
 const connections=[...new Map<string,Connection>([...connectionsA,...connectionsB].map(connection=>[connection.id,connection] as [string,Connection])).values()];
 async function createInvite(){
  if(user.isAnonymous||busy)return;
  setBusy(true);setMessage("");setInviteUrl("");
  try{
   const expiresAt=Timestamp.fromDate(new Date(Date.now()+7*24*60*60*1000));
   const created=await addDoc(collection(db,"friendInvites"),{inviterUid:user.uid,inviterName:displayName.trim().slice(0,60)||"A Plug member",status:"pending",createdAt:new Date().toISOString(),expiresAt});void trackPlugJourney("friend_invite_created",{source:"member_circle"});
   const url=window.location.origin+"/invite/"+created.id;setInviteUrl(url);
   try{if(navigator.share)await navigator.share({title:"Join me on The Plug",text:"Join my circle on The Plug.",url});else{await navigator.clipboard.writeText(url);setMessage("Invite link copied. Send it to your friend.")}}catch(error){if(error instanceof Error&&error.name==="AbortError"){setMessage("Invite created. You can still copy the link below.");}else setMessage("Invite created. Copy the link below to send it.")};
  }catch{setMessage("The invite could not be created. Check your connection and try again.")}finally{setBusy(false)}
 }
 async function copyInvite(){try{await navigator.clipboard.writeText(inviteUrl);setMessage("Invite link copied.")}catch{setMessage("Select and copy the invite link below.")}}
 async function removeConnection(connection:Connection){if(!window.confirm("Remove this friend connection? Their private activity will no longer be shared with you."))return;setMessage("");try{await deleteDoc(doc(db,"friendConnections",connection.id));setMessage("Friend connection removed.")}catch{setMessage("This connection could not be removed right now.")}}
 const pending=invites.filter(i=>i.status==="pending"&&(!i.expiresAt||i.expiresAt.toMillis()>Date.now()));
 return <section className="accountSection memberCircle" id="friends"><div className="panelHeading"><div><span className="kicker">YOUR CIRCLE</span><h2>Bring your people.</h2></div><span className="memberCircleCount">{connections.length} {connections.length===1?"friend":"friends"}</span></div><p className="orderTruth">Invite links expire after seven days. A connection starts only when your friend confirms their account and accepts. Your real, accepted circle helps The Plug understand its community and may inform future member offers; having more friends does not guarantee a discount.</p><button type="button" className="button buttonPrimary" onClick={()=>void createInvite()} disabled={busy}>{busy?"Creating invite…":"Invite a friend ↗"}</button>{inviteUrl&&<div className="memberInviteLink"><label htmlFor="plug-invite-url">Your invite link</label><input id="plug-invite-url" readOnly value={inviteUrl} onFocus={e=>e.currentTarget.select()}/><button type="button" className="button buttonLight" onClick={()=>void copyInvite()}>Copy link</button></div>}{pending.length>0&&<div className="memberCircleList"><h3>Waiting for a reply</h3>{pending.map(invite=><article key={invite.id}><span>Invite sent · expires {invite.expiresAt?.toDate().toLocaleDateString()||"in seven days"}</span><button type="button" className="textLink" onClick={()=>{setInviteUrl(window.location.origin+"/invite/"+invite.id);setMessage("Invite link ready to copy or share.")}}>Show link</button></article>)}</div>}{connections.length>0&&<div className="memberCircleList"><h3>Your friends</h3>{connections.map(connection=><article key={connection.id}><span>Connected member</span><button type="button" className="textLink" onClick={()=>void removeConnection(connection)}>Remove</button></article>)}</div>}{connections.length===0&&<p className="memberCircleEmpty">Your circle starts with one friend. No one is connected until both sides complete the invite flow.</p>}{message&&<p className="notice" role="status">{message}</p>}</section>
}
