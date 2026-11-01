"use client";
import {signInAnonymously,type User} from "firebase/auth";
import {auth,hasFirebaseWebConfig} from "@/lib/firebase/client";

let anonymousAuthPromise:Promise<User|null>|null=null;

export type PlugJourneyEvent =
  | "request_flow_opened"
  | "account_confirmed"
  | "notification_enabled"
  | "friend_invite_created"
  | "request_submitted"
  | "storefront_find_opened"
  | "storefront_offer_opened"
  | "product_request_clicked"
  | "community_feed_opened"
  | "catalogue_opened"
  | "instagram_opened"
  | "product_share_clicked"
  | "product_shared"
  | "product_bookmarked"
  | "product_unbookmarked";

type EventDetails={productLabel?:string;itemType?:"find"|"deal";category?:string;source?:string;requestId?:string};
export async function trackPlugJourney(event:PlugJourneyEvent,details:EventDetails={}){
 let user=auth.currentUser;if(!user&&hasFirebaseWebConfig){if(!anonymousAuthPromise)anonymousAuthPromise=signInAnonymously(auth).then(result=>result.user).catch(()=>null).finally(()=>{anonymousAuthPromise=null});user=await anonymousAuthPromise;}if(!user)return;
 const safeDetails={
  ...(typeof details.productLabel==="string"?{productLabel:details.productLabel.slice(0,120)}:{}),
  ...(details.itemType==="find"||details.itemType==="deal"?{itemType:details.itemType}:{}),
  ...(typeof details.category==="string"?{category:details.category.slice(0,40)}:{}),
  ...(typeof details.source==="string"?{source:details.source.slice(0,40)}:{}),
  ...(typeof details.requestId==="string"?{requestId:details.requestId.slice(0,100)}:{})
 };
 try{await fetch("/api/analytics/journey",{method:"POST",headers:{"Authorization":"Bearer "+await user.getIdToken(),"Content-Type":"application/json"},body:JSON.stringify({event,details:safeDetails})})}catch{/* Analytics must never interrupt the customer flow. */}
}
