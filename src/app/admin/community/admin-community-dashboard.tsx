"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {doc,getDoc,setDoc,updateDoc} from "firebase/firestore";
import {db} from "@/lib/firebase/client";
import {subscribeToAllPlugRequests,type PlugRequest} from "@/lib/firebase/plug-data";
type ActivityRow={request:PlugRequest;sharePurchases:"private"|"friends"|"public";activityExists:boolean;published:boolean};
export default function AdminCommunityDashboard(){
 const[rows,setRows]=useState<ActivityRow[]>([]),[loading,setLoading]=useState(true),[busyId,setBusyId]=useState(""),[message,setMessage]=useState("");
 useEffect(()=>subscribeToAllPlugRequests(requests=>{
  const completed=requests.filter(r=>r.status==="Delivered"||r.status==="Collected");
  void Promise.all(completed.map(async request=>{
   const [settings,activity]=await Promise.all([getDoc(doc(db,"memberSettings",request.customerId)),getDoc(doc(db,"communityActivity",request.id))]);
   const scope=settings.exists()&&["private","friends","public"].includes(settings.data().sharePurchases)?settings.data().sharePurchases as ActivityRow["sharePurchases"]:"private";
   return {request,sharePurchases:scope,activityExists:activity.exists(),published:activity.exists()&&activity.data().status==="published"} as ActivityRow;
  })).then(next=>{setRows(next);setLoading(false)}).catch(()=>{setMessage("Completed requests could not be prepared for sharing.");setLoading(false)});
 },error=>{setMessage(error.message);setLoading(false)}),[]);
 async function publish(row:ActivityRow){
  if(row.sharePurchases==="private"){setMessage("This member has chosen private sharing. Nothing was published.");return}
  setBusyId(row.request.id);setMessage("");
  try{
   const now=new Date().toISOString();const activityRef=doc(db,"communityActivity",row.request.id);
   if(row.activityExists)await updateDoc(activityRef,{status:"published",updatedAt:now});
   else await setDoc(activityRef,{ownerUid:row.request.customerId,sourceRequestId:row.request.id,productLabel:row.request.product.slice(0,120),audience:row.sharePurchases,status:"published",createdAt:row.request.updatedAt,updatedAt:now,publishedAt:now});
   setRows(current=>current.map(item=>item.request.id===row.request.id?{...item,activityExists:true,published:true}:item));setMessage("Completed find published using the member’s current privacy choice.");
  }catch{setMessage("Publishing was not confirmed. Check Firestore rules and the member’s current privacy setting.")}finally{setBusyId("")}
 }
 async function unpublish(row:ActivityRow){
  setBusyId(row.request.id);setMessage("");
  try{await updateDoc(doc(db,"communityActivity",row.request.id),{status:"archived",updatedAt:new Date().toISOString()});setRows(current=>current.map(item=>item.request.id===row.request.id?{...item,published:false}:item));setMessage("Community activity archived.");}
  catch{setMessage("The activity could not be archived. Check Firestore rules and try again.")}finally{setBusyId("")}
 }
 return <main className="adminPage"><div className="adminShell"><header className="adminHeader"><div><span className="kicker">THE PLUG · COMMUNITY</span><h1>Shared finds.</h1><p>Only completed requests and the member’s saved sharing choice can be published. Customer contact and delivery data never appear in the community feed.</p></div><div className="adminHeaderActions"><Link href="/admin" className="button buttonLight">Back to operations</Link><Link href="/" className="button buttonLight">Open storefront</Link></div></header>{message&&<p className="notice" role="status">{message}</p>}<section className="adminPanel"><div className="panelHeading"><div><span className="kicker">VERIFIED ACTIVITY</span><h2>Delivered & collected</h2></div></div>{loading?<div className="emptyState">Checking completed requests and member privacy…</div>:rows.length===0?<div className="emptyState">No delivered or collected requests are ready to review.</div>:<div className="queue">{rows.map(row=><article className="queueRow" key={row.request.id}><div><strong>{row.request.product}</strong><small>{row.request.status} · {row.request.customerName}</small><small>Sharing: {row.sharePurchases==="private"?"Private":row.sharePurchases==="friends"?"Accepted friends only":"Public community"}</small></div><div className="queueActions"><strong>{row.published?"Published":row.activityExists?"Archived":"Not published"}</strong>{row.published?<button type="button" className="button buttonLight" disabled={busyId===row.request.id} onClick={()=>void unpublish(row)}>Archive</button>:<button type="button" className="button buttonPrimary" disabled={busyId===row.request.id||row.sharePurchases==="private"} onClick={()=>void publish(row)}>{busyId===row.request.id?"Saving…":"Publish find"}</button>}</div></article>)}</div>}</section></div></main>
}
