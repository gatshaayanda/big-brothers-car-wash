"use client";
import {addDoc,collection,doc,getDoc,getDocs,onSnapshot,query,setDoc,updateDoc,deleteDoc,where} from "firebase/firestore";
import type {Unsubscribe} from "firebase/firestore";
import {db} from "@/lib/firebase/client";

export const ORDER_STATUSES=["New","Accepted","Preparing","Ready","Delivering","Collected","Delivered","Cancelled"] as const;
export type OrderStatus=typeof ORDER_STATUSES[number];
export type PaymentMethod="unpaid"|"cash"|"etransfer"|"other";
export type PaymentStatus="unpaid"|"paid"|"partial";
export type OrderItem={name:string;price:number;quantity:number};
export type CustomerProfile={uid:string;name:string;email:string;phone:string;preferredDeliveryLocation:string;notes:string;createdAt:string;updatedAt:string};
export type FoodOrder={id:string;customerId?:string;createdAt:string;customerName:string;phone:string;mode:"pickup"|"delivery";scheduledFor:string;deliveryLocation:string;instructions:string;items:OrderItem[];total:number;status:OrderStatus;paymentStatus?:PaymentStatus;paymentMethod?:PaymentMethod;amountPaid?:number};
export type MenuItem={id:string;name:string;price:number;friendPrice?:number;category:string;description:string;available:boolean;preparationMinutes:number;sortOrder:number;imageUrl?:string;section?:"daily"|"deal";days?:string[];brand?:string;productType?:string;sizes?:string[];colors?:string[];sourceUrl?:string};
export type BusinessSettings={id:string;location:string;hours:string;locationNote:string;updatedAt:string};export type NotificationPreferences={enabled:boolean;leadMinutes:number;updatedAt:string};
export type NotificationToken={token:string;admin:boolean;updatedAt:string};
export type DailyReconciliation={date:string;actualCash:number;actualETransfer:number;actualOther:number;notes:string;updatedAt:string};

const ordersCollection=collection(db,"orders");
const customersCollection=collection(db,"customers");
const menuCollection=collection(db,"menu");
const settingsCollection=collection(db,"businessSettings");
const reconciliationCollection=collection(db,"dailyReconciliations");

export function createFoodOrder(data:Omit<FoodOrder,"id">){const reference=doc(ordersCollection);return{id:reference.id,writePromise:setDoc(reference,data)}}
export async function getFoodOrder(id:string):Promise<FoodOrder|null>{const snapshot=await getDoc(doc(db,"orders",id));return snapshot.exists()?{id:snapshot.id,...snapshot.data() as Omit<FoodOrder,"id">}:null}
export async function getCustomerOrders(uid:string):Promise<FoodOrder[]>{const snapshot=await getDocs(query(ordersCollection,where("customerId","==",uid)));return snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<FoodOrder,"id">})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))}
export function subscribeToCustomerOrders(uid:string,onChange:(orders:FoodOrder[])=>void,onError:(error:Error)=>void):Unsubscribe{return onSnapshot(query(ordersCollection,where("customerId","==",uid)),snapshot=>onChange(snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<FoodOrder,"id">})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))),error=>onError(error instanceof Error?error:new Error("Customer order feed unavailable.")))}
export function subscribeToFoodOrder(id:string,onChange:(order:FoodOrder|null)=>void,onError:(error:Error)=>void):Unsubscribe{return onSnapshot(doc(db,"orders",id),snapshot=>onChange(snapshot.exists()?{id:snapshot.id,...snapshot.data() as Omit<FoodOrder,"id">}:null),error=>onError(error instanceof Error?error:new Error("Order updates unavailable.")))}
export async function getFoodOrders():Promise<FoodOrder[]>{const snapshot=await getDocs(ordersCollection);return snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<FoodOrder,"id">})).sort((a,b)=>b.scheduledFor.localeCompare(a.scheduledFor))}
export function subscribeToFoodOrders(onChange:(orders:FoodOrder[])=>void,onError:(error:Error)=>void):Unsubscribe{return onSnapshot(ordersCollection,snapshot=>onChange(snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<FoodOrder,"id">})).sort((a,b)=>b.scheduledFor.localeCompare(a.scheduledFor))),error=>onError(error instanceof Error?error:new Error("Order queue updates unavailable.")))}
export function subscribeToMenuItems(onChange:(items:MenuItem[])=>void,onError:(error:Error)=>void):Unsubscribe{return onSnapshot(menuCollection,snapshot=>onChange(snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<MenuItem,"id">})).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name))),error=>onError(error instanceof Error?error:new Error("Menu updates unavailable.")))}
export function subscribeToBusinessSettings(onChange:(settings:BusinessSettings|null)=>void,onError:(error:Error)=>void):Unsubscribe{return onSnapshot(doc(settingsCollection,"main"),snapshot=>onChange(snapshot.exists()?{id:snapshot.id,...snapshot.data() as Omit<BusinessSettings,"id">}:null),error=>onError(error instanceof Error?error:new Error("Business settings updates unavailable.")))}
export async function updateFoodOrderStatus(id:string,status:OrderStatus){await updateDoc(doc(db,"orders",id),{status})}
export async function updateFoodOrderPayment(id:string,paymentStatus:PaymentStatus,paymentMethod:PaymentMethod,amountPaid:number){await updateDoc(doc(db,"orders",id),{paymentStatus,paymentMethod,amountPaid:Math.max(0,amountPaid)})}
export async function isAdminUser(uid:string):Promise<boolean>{const snapshot=await getDoc(doc(db,"admins",uid));return snapshot.exists() && ["owner","staff"].includes(String(snapshot.data().role??"").toLowerCase())}
export async function getCustomerProfile(uid:string):Promise<CustomerProfile|null>{const snapshot=await getDoc(doc(customersCollection,uid));return snapshot.exists()?{uid:snapshot.id,...snapshot.data() as Omit<CustomerProfile,"uid">}:null}
export async function saveCustomerProfile(profile:CustomerProfile){await setDoc(doc(customersCollection,profile.uid),profile,{merge:true})}export async function getNotificationPreferences(uid:string):Promise<NotificationPreferences|null>{const snapshot=await getDoc(doc(db,"notificationPreferences",uid));return snapshot.exists()?snapshot.data() as NotificationPreferences:null}
export async function saveNotificationPreferences(uid:string,prefs:NotificationPreferences){await setDoc(doc(db,"notificationPreferences",uid),prefs,{merge:true})}
export async function saveNotificationToken(uid:string,token:string,admin:boolean){const encoded=encodeURIComponent(token);await setDoc(doc(db,"notificationTokens",uid,"tokens",encoded),{token,admin,updatedAt:new Date().toISOString()} as NotificationToken,{merge:true})}

export type ConversationAttachment={url:string;name:string;type:string;size:number};
export type Conversation={id:string;customerId:string;customerName?:string;title:string;status:"open"|"waiting"|"resolved";createdAt:string;updatedAt:string;lastMessageAt:string;lastMessagePreview:string;unreadForCustomer:boolean;unreadForAdmin:boolean;customerLastReadAt?:string;adminLastReadAt?:string};
export type ConversationMessage={id:string;senderId:string;senderRole:"customer"|"admin";text:string;attachment?:ConversationAttachment|null;createdAt:string};

const conversationsCollection=collection(db,"conversations");
export async function createCustomerConversation(uid:string,title:string):Promise<string>{
 const profile=await getCustomerProfile(uid);
 const now=new Date().toISOString();
 const reference=await addDoc(conversationsCollection,{customerId:uid,customerName:profile?.name||"The Plug customer",title,status:"open",createdAt:now,updatedAt:now,lastMessageAt:now,lastMessagePreview:"",unreadForCustomer:false,unreadForAdmin:false});
 return reference.id;
}
export function subscribeToCustomerConversations(uid:string,onChange:(items:Conversation[])=>void,onError:(error:Error)=>void):Unsubscribe{
 return onSnapshot(query(conversationsCollection,where("customerId","==",uid)),snapshot=>onChange(snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<Conversation,"id">})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))),error=>onError(error instanceof Error?error:new Error("Customer conversations unavailable.")));
}
export function subscribeToAdminConversations(onChange:(items:Conversation[])=>void,onError:(error:Error)=>void):Unsubscribe{
 return onSnapshot(conversationsCollection,snapshot=>onChange(snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<Conversation,"id">})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))),error=>onError(error instanceof Error?error:new Error("Customer inbox unavailable.")));
}
export function subscribeToConversation(id:string,onConversation:(conversation:Conversation|null)=>void,onMessages:(messages:ConversationMessage[])=>void,onError:(error:Error)=>void):Unsubscribe{
 const stopConversation=onSnapshot(doc(db,"conversations",id),snapshot=>onConversation(snapshot.exists()?{id:snapshot.id,...snapshot.data() as Omit<Conversation,"id">}:null),error=>onError(error instanceof Error?error:new Error("Conversation unavailable.")));
 const stopMessages=onSnapshot(query(collection(db,"conversations",id,"messages")),snapshot=>onMessages(snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<ConversationMessage,"id">})).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))),error=>onError(error instanceof Error?error:new Error("Messages unavailable.")));
 return ()=>{stopConversation();stopMessages()};
}
export async function updateConversationRead(id:string,role:"customer"|"admin"){const field=role==="customer"?"unreadForCustomer":"unreadForAdmin";const readField=role==="customer"?"customerLastReadAt":"adminLastReadAt";await updateDoc(doc(db,"conversations",id),{[field]:false,[readField]:new Date().toISOString()})}
export async function recordConversationMessage(id:string,role:"customer"|"admin",preview:string){await updateDoc(doc(db,"conversations",id),{updatedAt:new Date().toISOString(),lastMessageAt:new Date().toISOString(),lastMessagePreview:preview.slice(0,160),...(role==="customer"?{unreadForAdmin:true}:{unreadForCustomer:true})})}

const STARTER_MENU:MenuItem[]=[
{id:"daily-monday-ke-starch",name:"Ke Starch",price:0,category:"Monday",description:"",available:false,preparationMinutes:15,sortOrder:1,section:"daily",days:["Monday"]},{id:"daily-monday-beetroot",name:"Beetroot",price:0,category:"Monday",description:"",available:false,preparationMinutes:15,sortOrder:2,section:"daily",days:["Monday"]},{id:"daily-monday-pumpkin",name:"Pumpkin",price:0,category:"Monday",description:"",available:false,preparationMinutes:15,sortOrder:3,section:"daily",days:["Monday"]},{id:"daily-monday-chicken-stew",name:"Chicken + Stew",price:0,category:"Monday",description:"",available:false,preparationMinutes:20,sortOrder:4,section:"daily",days:["Monday"]},{id:"daily-monday-soup",name:"Soup",price:0,category:"Monday",description:"",available:false,preparationMinutes:15,sortOrder:5,section:"daily",days:["Monday"]},{id:"daily-monday-drink",name:"Drink of Choice",price:0,category:"Monday",description:"",available:false,preparationMinutes:5,sortOrder:6,section:"daily",days:["Monday"]},{id:"daily-tuesday-samp-stew",name:"Samp & Stew",price:0,category:"Tuesday",description:"",available:false,preparationMinutes:20,sortOrder:1,section:"daily",days:["Tuesday"]},{id:"daily-wednesday-pap",name:"Pap",price:0,category:"Wednesday",description:"",available:false,preparationMinutes:15,sortOrder:1,section:"daily",days:["Wednesday"]},{id:"daily-wednesday-braai",name:"Braai",price:0,category:"Wednesday",description:"",available:false,preparationMinutes:20,sortOrder:2,section:"daily",days:["Wednesday"]},{id:"daily-wednesday-chicken",name:"Chicken",price:0,category:"Wednesday",description:"",available:false,preparationMinutes:20,sortOrder:3,section:"daily",days:["Wednesday"]},{id:"daily-wednesday-morogo",name:"Morogo",price:0,category:"Wednesday",description:"",available:false,preparationMinutes:15,sortOrder:4,section:"daily",days:["Wednesday"]},{id:"daily-thursday-dumplings-chicken",name:"Dumplings & Chicken",price:0,category:"Thursday",description:"",available:false,preparationMinutes:20,sortOrder:1,section:"daily",days:["Thursday"]},{id:"daily-friday-hotdog-fries",name:"Hot Dog & Fries",price:0,category:"Friday",description:"",available:false,preparationMinutes:15,sortOrder:1,section:"daily",days:["Friday"]},
{id:"deal-beggar-chips",name:"Beggar & Chips",price:30,friendPrice:25,category:"Deal",description:"",available:true,preparationMinutes:15,sortOrder:101,section:"deal",days:[]},{id:"deal-hotdog",name:"Hot Dog",price:25,friendPrice:20,category:"Deal",description:"",available:true,preparationMinutes:10,sortOrder:102,section:"deal",days:[]},{id:"deal-potatoes",name:"Potatoes",price:10,category:"Deal",description:"",available:true,preparationMinutes:10,sortOrder:103,section:"deal",days:[]},{id:"deal-cup-drink",name:"Cup Drink",price:8,friendPrice:7.5,category:"Deal",description:"Bring a Friend: 2 for P15",available:true,preparationMinutes:2,sortOrder:104,section:"deal",days:[]},{id:"deal-still-water",name:"Still Water",price:7,friendPrice:5,category:"Deal",description:"Bring a Friend: 2 for P10",available:true,preparationMinutes:1,sortOrder:105,section:"deal",days:[]},{id:"deal-sausage-chips",name:"Sausage & Chips",price:30,category:"Deal",description:"",available:true,preparationMinutes:15,sortOrder:106,section:"deal",days:[]},{id:"deal-combo-sausage-chips-drink",name:"Combo: Sausage + Chips + Drink",price:40,category:"Deal",description:"",available:true,preparationMinutes:15,sortOrder:107,section:"deal",days:[]},{id:"deal-beggar-chips-drink",name:"Beggar + Chips + Drink",price:40,category:"Deal",description:"",available:true,preparationMinutes:15,sortOrder:108,section:"deal",days:[]}];
export async function ensureStarterMenuSeeded():Promise<MenuItem[]>{const snapshot=await getDocs(menuCollection);if(snapshot.docs.length)return snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<MenuItem,"id">})).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));const marker=await getDoc(doc(settingsCollection,"menu-seed-v1"));if(marker.exists())return [];for(const item of STARTER_MENU)await setDoc(doc(menuCollection,item.id),item);await setDoc(doc(settingsCollection,"menu-seed-v1"),{seeded:true,version:1,updatedAt:new Date().toISOString()});return STARTER_MENU;}

// Legacy menu migration is intentionally disabled. 
// Existing menu records must never be silently reclassified by the current day. 


const MENU_CACHE_KEY="the-plug-menu-cache-v2";
export function readCachedMenuItems():MenuItem[]{if(typeof window==="undefined")return [];try{const raw=window.localStorage.getItem(MENU_CACHE_KEY);return raw?JSON.parse(raw) as MenuItem[]:[]}catch{return []}}
export async function getMenuItems():Promise<MenuItem[]>{const snapshot=await getDocs(menuCollection);const items=snapshot.docs.map(item=>({id:item.id,...item.data() as Omit<MenuItem,"id">})).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name));try{if(typeof window!=="undefined")window.localStorage.setItem(MENU_CACHE_KEY,JSON.stringify(items))}catch{}return items}
export async function saveMenuItem(item:MenuItem){await setDoc(doc(menuCollection,item.id),item)}
export async function deleteMenuItem(id:string){await deleteDoc(doc(db,"menu",id))}
export async function getBusinessSettings():Promise<BusinessSettings|null>{const snapshot=await getDoc(doc(settingsCollection,"main"));return snapshot.exists()?{id:snapshot.id,...snapshot.data() as Omit<BusinessSettings,"id">}:null}
export async function saveBusinessSettings(settings:BusinessSettings){await setDoc(doc(settingsCollection,"main"),settings)}
export async function getDailyReconciliation(date:string):Promise<DailyReconciliation|null>{const snapshot=await getDoc(doc(reconciliationCollection,date));return snapshot.exists()?{date:snapshot.id,...snapshot.data() as Omit<DailyReconciliation,"date">}:null}
export async function saveDailyReconciliation(record:DailyReconciliation){await setDoc(doc(reconciliationCollection,record.date),record)}
