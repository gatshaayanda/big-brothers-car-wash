"use client";
import {useEffect,useMemo,useState} from "react";
import {collection,doc,getDoc,onSnapshot,query,where} from "firebase/firestore";
import type {User} from "firebase/auth";
import {db} from "@/lib/firebase/client";
type Connection={id:string;memberA:string;memberB:string};
type Activity={id:string;ownerUid:string;productLabel:string;createdAt:string;audience:string;status:string};
type Interests={newDrops:boolean;seasonalBuys:boolean;loyaltyUpdates:boolean};
type SharedInterests={uid:string;shareInterests:boolean;interests:Interests};
const INTEREST_LABELS:Record<keyof Interests,string>={newDrops:"New drops",seasonalBuys:"Seasonal buys",loyaltyUpdates:"Loyalty updates"};
function dateLabel(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"Recently":date.toLocaleDateString(undefined,{day:"numeric",month:"short"})}
export default function MemberActivityFeed({user}:{user:User}){
 const[connectionsA,setConnectionsA]=useState<Connection[]>([]),[connectionsB,setConnectionsB]=useState<Connection[]>([]),[ownItems,setOwnItems]=useState<Activity[]>([]),[friendItems,setFriendItems]=useState<Activity[]>([]),[sharedInterests,setSharedInterests]=useState<SharedInterests[]>([]),[message,setMessage]=useState("");
 const friendUids=useMemo(()=>[...new Set([...connectionsA,...connectionsB].map(c=>c.memberA===user.uid?c.memberB:c.memberA))].filter(uid=>uid!==user.uid),[connectionsA,connectionsB,user.uid]);
 useEffect(()=>{
  const stopA=onSnapshot(query(collection(db,"friendConnections"),where("memberA","==",user.uid)),snap=>setConnectionsA(snap.docs.map(d=>({id:d.id,...d.data()} as Connection))),()=>setMessage("Your friend feed could not be loaded."));
  const stopB=onSnapshot(query(collection(db,"friendConnections"),where("memberB","==",user.uid)),snap=>setConnectionsB(snap.docs.map(d=>({id:d.id,...d.data()} as Connection))),()=>setMessage("Your friend feed could not be loaded."));
  const stopOwn=onSnapshot(query(collection(db,"communityActivity"),where("ownerUid","==",user.uid)),snap=>setOwnItems(snap.docs.map(d=>({id:d.id,...d.data()} as Activity)).filter(item=>item.status==="published").sort((a,b)=>b.createdAt.localeCompare(a.createdAt))),()=>setMessage("Your shared activity could not be loaded."));
  return()=>{stopA();stopB();stopOwn()};
 },[user.uid]);
 useEffect(()=>{
  let active=true;setSharedInterests([]);if(friendUids.length===0)return;
  void Promise.all(friendUids.map(async uid=>{try{const snap=await getDoc(doc(db,"memberFeedPreferences",uid));if(!snap.exists())return null;const data=snap.data();if(data.shareInterests!==true||!data.interests)return null;return {uid,shareInterests:true,interests:{newDrops:data.interests.newDrops===true,seasonalBuys:data.interests.seasonalBuys===true,loyaltyUpdates:data.interests.loyaltyUpdates===true}} as SharedInterests}catch{return null}})).then(items=>{if(active)setSharedInterests(items.filter((item):item is SharedInterests=>item!==null))});return()=>{active=false};
 },[friendUids]);
 useEffect(()=>{
  setFriendItems([]);if(friendUids.length===0)return;
  const byOwner=new Map<string,Activity[]>();
  const stops=friendUids.map(uid=>onSnapshot(query(collection(db,"communityActivity"),where("ownerUid","==",uid),where("status","==","published"),where("audience","==","friends")),snap=>{byOwner.set(uid,snap.docs.map(d=>({id:d.id,...d.data()} as Activity)));setFriendItems([...byOwner.values()].flat().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))},()=>setMessage("Some friend activity could not be loaded.")));
  return()=>stops.forEach(stop=>stop());
 },[friendUids]);
 return <section className="accountSection memberActivity" id="activity"><div className="panelHeading"><div><span className="kicker">YOUR FEED</span><h2>Yours & your circle.</h2></div></div><div className="memberActivityColumns"><div><h3>Your shared finds</h3>{ownItems.length?ownItems.map(item=><article key={item.id}><span>{dateLabel(item.createdAt)} · YOU SHARED</span><strong>{item.productLabel}</strong></article>):<p className="memberCircleEmpty">Your purchases stay private unless you choose a sharing audience and Frank publishes a completed find.</p>}</div><div><h3>Friends’ shared finds</h3>{sharedInterests.length>0&&<div className="memberSharedInterests"><strong>What your friends follow</strong>{sharedInterests.map(item=>{const labels=(Object.keys(INTEREST_LABELS) as (keyof Interests)[]).filter(key=>item.interests[key]).map(key=>INTEREST_LABELS[key]);return labels.length?<p key={item.uid}>{labels.join(" · ")}</p>:null})}</div>}{friendItems.length?friendItems.map(item=><article key={item.id}><span>{dateLabel(item.createdAt)} · FRIENDS</span><strong>{item.productLabel}</strong><small>Shared by a connected member</small></article>):<p className="memberCircleEmpty">{friendUids.length?"Your friends haven’t shared a completed find yet.":"Connect with friends to see activity they choose to share with friends."}</p>}</div></div>{message&&<p className="notice" role="status">{message}</p>}</section>
}
