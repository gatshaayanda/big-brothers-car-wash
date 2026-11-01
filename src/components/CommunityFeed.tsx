"use client";
import {useEffect,useRef,useState} from "react";
import {collection,onSnapshot,query,where} from "firebase/firestore";
import {db,hasFirebaseWebConfig} from "@/lib/firebase/client";
import {trackPlugJourney} from "@/lib/firebase/journey-analytics";
import PlugLoadingState from "@/components/PlugLoadingState";
type Activity={id:string;productLabel:string;createdAt:string;audience:"public"|"friends";status:string};
function dateLabel(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?"Recently":date.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}
export default function CommunityFeed(){
 const[items,setItems]=useState<Activity[]>([]),[memberCount,setMemberCount]=useState<number|null>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);const feedRef=useRef<HTMLElement|null>(null);const trackedView=useRef(false);
 useEffect(()=>{const node=feedRef.current;if(!node||trackedView.current)return;if(typeof IntersectionObserver==="undefined"){trackedView.current=true;void trackPlugJourney("community_feed_opened",{source:"homepage"});return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&!trackedView.current){trackedView.current=true;void trackPlugJourney("community_feed_opened",{source:"homepage"});observer.disconnect();}},{threshold:0.25});observer.observe(node);return()=>observer.disconnect()},[]);
 useEffect(()=>{
  if(!hasFirebaseWebConfig){setItems([]);setMemberCount(null);setLoaded(true);setFailed(true);return;}
  let settled=false;const timeout=window.setTimeout(()=>{if(!settled){setLoaded(true);setFailed(true);}},5000);
  const stopActivity=onSnapshot(query(collection(db,"communityActivity"),where("status","==","published"),where("audience","==","public")),snap=>{settled=true;window.clearTimeout(timeout);setItems(snap.docs.map(d=>({id:d.id,...d.data()} as Activity)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,8));setLoaded(true);setFailed(false)},error=>{settled=true;window.clearTimeout(timeout);console.error("[The Plug] community feed failed:",error.code,error.message);setItems([]);setLoaded(true);setFailed(true)});
  const stopMembers=onSnapshot(query(collection(db,"memberSettings"),where("showInCircle","==",true)),snap=>setMemberCount(snap.size),error=>{console.error("[The Plug] member count failed:",error.code,error.message);setMemberCount(null)});
  return()=>{window.clearTimeout(timeout);stopActivity();stopMembers()};
 },[attempt]);
 return <section ref={feedRef} className="plugCommunityFeed" id="community"><div className="plugContainer"><div className="plugCommunityHead"><div><span className="plugKicker">THE COMMUNITY EDIT</span><h2>Finds worth <em>sharing.</em></h2><p>Product finds and completed sourcing information published by The Plug. Public posts show the item, not the customer’s name.</p></div>{memberCount!==null&&<div className="plugCircleCountPublic"><strong>{memberCount}</strong><span>opted-in Circle {memberCount===1?"member":"members"}</span></div>}</div>{!loaded?<PlugLoadingState message="Checking shared finds…" onRetry={()=>{setLoaded(false);setFailed(false);setAttempt(value=>value+1)}}/> :items.length>0?<div className="plugCommunityRail">{items.map(item=><article key={item.id}><span>COMPLETED FIND · {dateLabel(item.createdAt)}</span><h3>{item.productLabel}</h3><p>Published by The Plug</p></article>)}</div>:<div className="plugCommunityEmpty">{failed?<><span>Shared finds aren’t available right now.</span><button type="button" className="plugFeedRetry" onClick={()=>{setLoaded(false);setFailed(false);setAttempt(value=>value+1)}}>Retry loading ↻</button></>:"When Frank publishes eligible product/find information, it will appear here."}</div>}</div></section>
}
