"use client";
import Link from "next/link";
import {FormEvent,useEffect,useMemo,useState} from "react";
import {signInAnonymously,onAuthStateChanged,type User} from "firebase/auth";
import {createFoodOrder,getCustomerProfile,getMenuItems,readCachedMenuItems,saveCustomerProfile,type MenuItem} from "@/lib/firebase/data";
import {auth} from "@/lib/firebase/client";
import NotificationSettings from "@/components/NotificationSettings";
function gaboroneDateKey(date=new Date()){const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Africa/Gaborone",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);return `${parts.find(p=>p.type==="year")?.value}-${parts.find(p=>p.type==="month")?.value}-${parts.find(p=>p.type==="day")?.value}`}
function weekdayForDate(dateKey:string){return new Intl.DateTimeFormat("en-US",{weekday:"long",timeZone:"Africa/Gaborone"}).format(new Date(`${dateKey}T12:00:00`))}
function addGaboroneDays(dateKey:string,offset:number){const date=new Date(`${dateKey}T12:00:00`);date.setUTCDate(date.getUTCDate()+offset);return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,"0")}-${String(date.getUTCDate()).padStart(2,"0")}`}
function orderUnitPrice(item:MenuItem,quantity:number){return item.friendPrice!==undefined&&quantity>=2?item.friendPrice:item.price}
function gaboroneNowDate(){return gaboroneDateKey()}function gaboroneNowTime(){const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Gaborone",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date());const get=(type:string)=>parts.find(p=>p.type===type)?.value??"";return `${get("hour")}:${get("minute")}`}
function gaboroneScheduledIso(value:string){return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)?value+":00+02:00":value}
export default function OrderForm(){
 const today=gaboroneDateKey();
 const[menu,setMenu]=useState<MenuItem[]>([]),[menuLoaded,setMenuLoaded]=useState(false),[menuUnavailable,setMenuUnavailable]=useState(false);
 const[quantities,setQuantities]=useState<Record<string,number>>({}),[scheduledDate,setScheduledDate]=useState(""),[scheduledTime,setScheduledTime]=useState(""),[selectedDate,setSelectedDate]=useState(today);
 const[submitted,setSubmitted]=useState(false),[reference,setReference]=useState(""),[pendingSync,setPendingSync]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[user,setUser]=useState<User|null>(null),[saved,setSaved]=useState({name:"",phone:"",location:"",notes:""});
 useEffect(()=>{const requested=new URLSearchParams(window.location.search).get("date");if(requested&&/^\d{4}-\d{2}-\d{2}$/.test(requested)&&requested>=today){setSelectedDate(requested);setScheduledDate(requested)}} , [today]);
 useEffect(()=>{const unsub=onAuthStateChanged(auth,async next=>{setUser(next);if(next){try{const profile=await getCustomerProfile(next.uid);if(profile)setSaved({name:profile.name,phone:profile.phone,location:profile.preferredDeliveryLocation,notes:profile.notes})}catch(error){console.warn("The Plug customer profile unavailable",error)}}});void getMenuItems().then(setMenu).catch(()=>{const cached=readCachedMenuItems();if(cached.length){setMenu(cached);setMenuUnavailable(false)}else setMenuUnavailable(true)}).finally(()=>setMenuLoaded(true));return unsub},[]);
 const visibleMenu=useMemo(()=>{const legacyToday=menu.filter(item=>item.available&&item.section==="deal"&&item.category.trim().toLowerCase()==="deal"&&!item.id.startsWith("deal-"));const daily=menu.filter(item=>item.available&&item.section==="daily"&&(item.days??[]).includes(weekdayForDate(selectedDate)));const deals=menu.filter(item=>item.available&&(item.section==="deal"||(!item.section&&item.category.toLowerCase()==="deal"))&&!legacyToday.some(service=>service.id===item.id));return [...daily,...(selectedDate===today?legacyToday:[]),...deals].filter((item,index,array)=>array.findIndex(candidate=>candidate.id===item.id)===index)},[menu,selectedDate,today]);
 const nextPublishedDate=useMemo(()=>{for(let offset=1;offset<=7;offset++){const candidate=addGaboroneDays(selectedDate,offset);if(menu.some(item=>item.available&&item.section==="daily"&&(item.days??[]).includes(weekdayForDate(candidate))))return candidate}return null},[menu,selectedDate]);

 const selected=useMemo(()=>menu.filter(item=>(quantities[item.id]??0)>0).map(item=>({...item,quantity:quantities[item.id]??0})),[menu,quantities]);
 const unavailableSelected=useMemo(()=>selected.filter(item=>!visibleMenu.some(availableItem=>availableItem.id===item.id)),[selected,visibleMenu]);
 const total=selected.filter(item=>!unavailableSelected.some(unavailable=>unavailable.id===item.id)).reduce((sum,item)=>sum+orderUnitPrice(item,item.quantity)*item.quantity,0);
 function change(id:string,delta:number){setQuantities(current=>({...current,[id]:Math.max(0,(current[id]??0)+delta)}))}
 function onScheduledDateChange(value:string){setScheduledDate(value);setSelectedDate(value)}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;if(!selected.length){setError(menuUnavailable||!visibleMenu.length?"No menu items are currently published for this date. Choose another published date or call The Plug on 76425849 / 76769834.":"Choose at least one food item.");return}if(unavailableSelected.length){setError("One or more selected items are not published for "+weekdayForDate(selectedDate)+". Remove them or choose a date when they are available.");return}setBusy(true);setError("");
  const form=new FormData(event.currentTarget),name=String(form.get("customerName")??"").trim(),phone=String(form.get("phone")??"").trim(),mode=String(form.get("mode")??"pickup") as "pickup"|"delivery",formDate=String(form.get("scheduledDate")??scheduledDate),formTime=String(form.get("scheduledTime")??scheduledTime),scheduledFor=gaboroneScheduledIso(formDate&&formTime?`${formDate}T${formTime}`:""),deliveryLocation=String(form.get("deliveryLocation")??"").trim(),instructions=String(form.get("instructions")??"").trim();
  if(!name||!phone||!formDate||!formTime||!scheduledFor){setError("Please choose the date and time you need the order.");setBusy(false);return}
  const scheduledMs=new Date(scheduledFor).getTime();if(!Number.isFinite(scheduledMs)||scheduledMs<Date.now()){setError("Choose a future time for your order.");setBusy(false);return}
  if(mode==="delivery"&&!deliveryLocation){setError("Add your delivery location or landmark.");setBusy(false);return}
  try{
   let customer=user;
   if(!customer)customer=(await signInAnonymously(auth)).user
   const order={customerId:customer.uid,createdAt:new Date().toISOString(),customerName:name,phone,mode,scheduledFor,deliveryLocation,instructions,items:selected.map(({name,price,friendPrice,quantity})=>({name,price:orderUnitPrice({name,price,friendPrice} as MenuItem,quantity),quantity})),total,status:"New" as const};
   const offline=!navigator.onLine;const{id,writePromise}=createFoodOrder(order);setReference(id);try{window.localStorage.setItem(`the-plug-order-${id}`,JSON.stringify({...order,id}));window.localStorage.setItem(`the-plug-pending-order-notification-${id}`,"1")}catch{}
   // Customer profile persistence is a convenience, never a reason to reject an order.
   // Firestore may deny/read-fail an empty profile while the order write itself is valid.
   if(offline){void writePromise.catch(console.error);setPendingSync(true)}else{await writePromise;setPendingSync(false);try{const idToken=await customer.getIdToken();const notificationResponse=await fetch("/api/notifications/order-created",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+idToken},body:JSON.stringify({orderId:id})});if(notificationResponse.ok)window.localStorage.removeItem(`the-plug-pending-order-notification-${id}`)}catch(notificationError){console.warn("The Plug new-order notification request failed",notificationError)}}
   if(customer){
    const now=new Date().toISOString();
    void getCustomerProfile(customer.uid)
      .catch(profileError=>{console.warn("The Plug customer profile read unavailable",profileError);return null})
      .then(existing=>{
       const profile={uid:customer.uid,name,email:customer.email??existing?.email??"",phone,preferredDeliveryLocation:deliveryLocation||existing?.preferredDeliveryLocation||"",notes:instructions||existing?.notes||"",createdAt:existing?.createdAt??now,updatedAt:now};
       return saveCustomerProfile(profile);
      })
      .catch(profileError=>console.warn("The Plug customer profile save unavailable",profileError));
   }
   setSubmitted(true);event.currentTarget.reset();
  }catch(error){console.error("The Plug order submission failed",error);setError("The order could not be confirmed online. Please check the connection and try again, or call The Plug on 76425849 / 76769834.")}finally{setBusy(false)}
 }
 if(submitted)return (
  <main className="orderPage">
   <div className="orderWrap">
    <div className="orderCard confirm">
     <div className="confirmIcon">🍔</div>
     <span className="kicker">{pendingSync?"Offline save":"Order submitted"}</span>
     <h1>{pendingSync?"Saved on this phone.":"Order received."}</h1>
     <p>{pendingSync?"Your order is waiting to synchronize. Reconnect this device so it can reach The Plug. Until then, the kitchen has not received it.":"Your order was written to the The Plug order queue. The kitchen can review it and contact you if needed."}</p>
     <strong>Reference #{reference.slice(0,8).toUpperCase()}</strong>
     <NotificationSettings/>
     <div className="actions centered">
      <div>
       <p className="orderTruth"><strong>Your order is saved with The Plug.</strong> You can follow it from <Link href="/account">My The Plug</Link> when this guest session is available.</p>
      </div>
      <div>
       <Link className="button buttonLight" href="/account">My The Plug →</Link>
       <p className="orderTruth">Opens your private order history and activity feed.</p>
      </div>
      <div>
       <Link className="button buttonLight" href="/">Back to The Plug →</Link>
       <p className="orderTruth">Returns to the menu and deals. Your submitted order stays in the kitchen queue.</p>
      </div>
     </div>
    </div>
   </div>
  </main>
 );
 return <main className="orderPage"><div className="orderWrap"><div className="orderHeader"><Link href="/" className="logo"><span className="logoMark">B</span><span>The Plug</span></Link><Link href="/account" className="button buttonLight">My The Plug</Link></div><div className="sectionHead"><div><span className="kicker">Order ahead</span><h1>{selectedDate===today?"Choose your food.":"Pre-order your food."}</h1><p>{selectedDate===today?"Order as a guest. Your name and contact details can be saved with The Plug automatically for faster future orders.":"Planning for "+weekdayForDate(selectedDate)+". Menu & deals are set to this date, and the kitchen can see your scheduled order ahead of the food day."}</p></div></div><form onSubmit={submit} className="orderGrid"><div className="orderCard"><h2>Menu & deals</h2><div className="fieldGrid"><label>When do you need it?<input name="scheduledDate" type="date" min={gaboroneNowDate()} value={scheduledDate} onChange={event=>onScheduledDateChange(event.target.value)} required/></label><label>Time<input name="scheduledTime" type="time" min={scheduledDate===today?gaboroneNowTime():undefined} value={scheduledTime} onChange={event=>setScheduledTime(event.target.value)} required/></label></div>{!menuLoaded?<div className="emptyState">Loading the current The Plug menu…</div>:visibleMenu.length?<div className="orderItems">{visibleMenu.map(item=>{const quantity=quantities[item.id]??0;const unitPrice=orderUnitPrice(item,quantity);return <article className="orderItem" key={item.id}><div><strong>{item.name}</strong><small>P{item.price.toFixed(item.price%1?1:0)}{item.friendPrice!==undefined?" · Bring a Friend P"+item.friendPrice.toFixed(item.friendPrice%1?2:0):""}</small>{item.friendPrice!==undefined&&quantity>=2&&<small className="friendPriceActive">Bring-a-Friend price active · P{unitPrice.toFixed(unitPrice%1?2:0)} each</small>}</div><div className="qty"><button type="button" onClick={()=>change(item.id,-1)} aria-label={"Remove "+item.name}>−</button><strong>{quantity}</strong><button type="button" onClick={()=>change(item.id,1)} aria-label={"Add "+item.name}>+</button></div></article>})}</div>:<div className="emptyState"><strong>{menuUnavailable?"The The Plug menu could not be loaded.":"No menu items are published for "+weekdayForDate(selectedDate)+"."}</strong>{!menuUnavailable&&nextPublishedDate&&<div className="nextFoodCard"><span className="kicker">Next food day · {weekdayForDate(nextPublishedDate)}</span><strong>There&apos;s another food day coming.</strong><p>You can switch to {weekdayForDate(nextPublishedDate)} and pre-order now, so your request is already on the kitchen radar before the food day starts.</p><Link className="button buttonPrimary" href={"/order?date="+nextPublishedDate}>Order ahead for {weekdayForDate(nextPublishedDate)} →</Link></div>}{!menuUnavailable&&!nextPublishedDate&&<p>There is no future daily food published yet. Call The Plug on 76425849 / 76769834 if you need help.</p>}<div className="contactRow"><a className="button buttonDark" href="tel:76425849">Call 76425849</a><a className="button buttonLight" href="tel:76769834">Call 76769834</a></div></div>}<p className="orderTruth">Only currently published, available menu items can be ordered here. Bring-a-Friend pricing is controlled by the The Plug kitchen admin.</p>{selected.length>0&&<div className="orderSelectionSummary"><strong>Your order</strong>{selected.map(item=>{const unavailable=unavailableSelected.some(candidate=>candidate.id===item.id);return <div className={unavailable?"selectionUnavailable":"selectionLine"} key={item.id}><span>{item.quantity} × {item.name} · {unavailable?"Not available for "+weekdayForDate(selectedDate):"P"+(orderUnitPrice(item,item.quantity)*item.quantity).toFixed(2)}</span><button type="button" onClick={()=>setQuantities(current=>({...current,[item.id]:0}))}>Remove</button></div>})}{unavailableSelected.length>0&&<small className="selectionWarning">Changing the date does not erase your selection. Items that are not published for the chosen day stay here until you remove them or choose a compatible date.</small>}</div>}</div><div className="orderCard"><h2>Your details</h2><p className="orderTruth">No account is required. The Plug uses a temporary guest session to keep this order private and trackable on this device.</p><div className="fieldGrid"><label>Name<input name="customerName" autoComplete="name" defaultValue={saved.name} required/></label><label>Phone / WhatsApp<input name="phone" type="tel" autoComplete="tel" defaultValue={saved.phone} required/></label><label>Order type<select name="mode" defaultValue="pickup"><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label><label className="fieldFull">Delivery location / landmark <span>(required for delivery)</span><input name="deliveryLocation" defaultValue={saved.location} placeholder="BAC Library, main entrance..."/></label><label className="fieldFull">Instructions <span>(optional)</span><textarea name="instructions" defaultValue={saved.notes} placeholder="Call when outside, no onions, etc."/></label></div><div className="total"><span>Total</span><strong>P{total.toFixed(2)}</strong></div>{error&&<p role="alert" className="notice">{error}</p>}<button className="button buttonPrimary" type="submit" disabled={busy||!selected.length||unavailableSelected.length>0}>{busy?"Saving order…":"Place order"}</button></div></form></div></main>;
}