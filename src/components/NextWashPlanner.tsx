"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeSettings } from "@/lib/firebase/big-brothers-data";

type DayChoice = { date: string; rain: number | null; label: string; week: string };
const dateKey = (d: Date) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const dateAtNoon = (key: string) => new Date(key+"T12:00:00");
const displayDate = (key: string) => new Intl.DateTimeFormat("en-BW",{weekday:"long",day:"numeric",month:"long"}).format(dateAtNoon(key));
const weekdays = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export default function NextWashPlanner() {
 const [settings,setSettings] = useState<Record<string,unknown>>({});
 const [forecast,setForecast] = useState<Record<string,number>>({});
 const [forecastReady,setForecastReady] = useState(false);
 const [month,setMonth] = useState(()=>{const d=new Date();d.setDate(d.getDate()+8);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")});
 const [selected,setSelected] = useState("");
 const [time,setTime] = useState("11:00");
 const [toast,setToast] = useState("");
 const [availability,setAvailability] = useState<Record<string,string[]>>({});
 const [availabilityLoading,setAvailabilityLoading] = useState(false);
 const opening = typeof settings.openingTime==="string" ? settings.openingTime : "";
 const closing = typeof settings.closingTime==="string" ? settings.closingTime : "";
 const openingMinutes = opening ? Number(opening.slice(0,2))*60+Number(opening.slice(3,5)) : 8*60;
 const closingMinutes = closing ? Number(closing.slice(0,2))*60+Number(closing.slice(3,5)) : 18*60;
 const hoursConfigured = Boolean(opening && closing);

 useEffect(()=>subscribeSettings(value=>setSettings(value||{}),()=>setToast("Business hours could not be loaded. Your request will need staff confirmation.")),[]);
 useEffect(()=>{
  let cancelled=false;
  fetch("https://api.open-meteo.com/v1/forecast?latitude=-24.65&longitude=25.91&daily=precipitation_probability_max,weather_code&timezone=Africa%2FGaborone&forecast_days=16")
   .then(r=>{if(!r.ok)throw new Error("Forecast unavailable");return r.json()})
   .then(data=>{if(cancelled)return;const next:Record<string,number>={};(data.daily?.time||[]).forEach((key:string,i:number)=>{const rain=Number(data.daily.precipitation_probability_max?.[i]);if(Number.isFinite(rain))next[key]=rain});setForecast(next)})
   .catch(()=>{if(!cancelled)setToast("Live weather outlook is unavailable right now. You can still choose any available date.")})
   .finally(()=>{if(!cancelled)setForecastReady(true)});
  return()=>{cancelled=true};
 },[]);
 const minDate = useMemo(()=>{const d=new Date();d.setDate(d.getDate()+1);return dateKey(d)},[]);
 const choices = useMemo(()=>{
  const make=(from:number,to:number,week:string):DayChoice|null=>{
   const days=Array.from({length:to-from+1},(_,i)=>{const d=new Date();d.setDate(d.getDate()+from+i);return dateKey(d)})
    .filter(key=>{const d=dateAtNoon(key);return !closedDays.includes(d.toLocaleDateString("en-US",{weekday:"long"}).toLowerCase())});
   if(!days.length)return null;
   const known=days.filter(key=>forecast[key]!==undefined).sort((a,b)=>(forecast[a]??100)-(forecast[b]??100));
   const chosen=known[0]||days[0];
   return {date:chosen,rain:forecast[chosen]??null,label:known.length?"Lower rain outlook":"Long-range planning date",week};
  };
  return [make(8,14,"Week 2"),make(15,21,"Week 3")].filter((x):x is DayChoice=>Boolean(x));
 },[forecast,closedDays.join("|")]);
 const monthParts=month.split("-").map(Number);
 const first=new Date(monthParts[0],monthParts[1]-1,1);
 const daysInMonth=new Date(monthParts[0],monthParts[1],0).getDate();
 const offset=(first.getDay()+6)%7;
 const monthLabel=new Intl.DateTimeFormat("en-BW",{month:"long",year:"numeric"}).format(first);
 const shiftMonth=(delta:number)=>{const d=new Date(monthParts[0],monthParts[1]-1+delta,1);setMonth(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"))};
 const timeSlots=useMemo(()=>{const slots:string[]=[];for(let minute=openingMinutes;minute<=closingMinutes;minute+=30){slots.push(String(Math.floor(minute/60)).padStart(2,"0")+":"+String(minute%60).padStart(2,"0"))}return slots},[openingMinutes,closingMinutes]);
 const choose=(date:string,selectedTime=(timeSlots.includes("11:00")?"11:00":timeSlots[0]||"11:00"))=>{setSelected(date);setTime(selectedTime);setToast("Selected "+displayDate(date)+". Choose your preferred time, then send the request to the Brothers.");};
 const continueToRequest=()=>{if(!selected){setToast("Choose a suggested day or a date in the calendar first.");return}window.location.assign("/?journey=book&preferredDate="+encodeURIComponent(selected)+"&preferredTime="+encodeURIComponent(time)+"#request")};
 useEffect(()=>{
  if(!selected)return;
  let cancelled=false;setAvailabilityLoading(true);
  fetch("/api/bookings/availability?date="+encodeURIComponent(selected)+"&mode=site",{cache:"no-store"})
   .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||"Times could not be checked");if(!cancelled){const slots=Array.isArray(d.slots)?d.slots:[];setAvailability(prev=>({...prev,[selected]:slots}));if(slots.length)setTime(current=>slots.includes(current)?current:slots[0]);}})
   .catch(()=>{if(!cancelled)setToast("Live slot checking is unavailable. Your preferred time will be reviewed by staff.")})
   .finally(()=>{if(!cancelled)setAvailabilityLoading(false)});
  return()=>{cancelled=true};
 },[selected]);
 const slots=availability[selected]||[];
 return <section className="bb-next-wash" aria-labelledby="bb-next-wash-title">
  <div className="bb-next-wash-heading"><p className="big-brothers-eyebrow">PLAN AHEAD · G-WEST</p><h2 id="bb-next-wash-title">Your next wash</h2><p>No confirmed booking yet. Let's find a good day for your next visit.</p></div>
  <div className="bb-wash-suggestions"><div className="bb-wash-suggestions-title"><span>🌤️</span><div><strong>Your next good wash windows</strong><small>Two suggested options in different weeks. Weather can change, so we'll refresh the outlook closer to your visit.</small></div></div>
   <div className="bb-wash-suggestion-grid">{choices.map(choice=><button type="button" key={choice.week} className={"bb-wash-suggestion"+(selected===choice.date?" selected":"")} onClick={()=>choose(choice.date)}><span>{choice.week}</span><strong>{displayDate(choice.date)}</strong><b>11:00 – 13:00</b><small>{choice.rain===null?"Forecast not available this far ahead":choice.rain+"% rain probability · "+choice.label}</small><i>{selected===choice.date?"Selected ✓":"Choose this day →"}</i></button>)}</div>
   {!forecastReady&&<p className="bb-planner-status">Checking the local weather outlook…</p>}
  </div>
  <div className="bb-calendar-panel"><div className="bb-calendar-top"><div><strong>Want another day?</strong><p>Choose any future date. Dates marked closed by Big Brothers cannot be selected.</p></div><div className="bb-calendar-month"><button type="button" onClick={()=>shiftMonth(-1)} aria-label="Previous month" disabled={month<=minDate.slice(0,7)}>‹</button><strong>{monthLabel}</strong><button type="button" onClick={()=>shiftMonth(1)} aria-label="Next month">›</button></div></div>
   <div className="bb-calendar-weekdays">{weekdays.map(day=><span key={day}>{day}</span>)}</div>
   <div className="bb-calendar-days">{Array.from({length:offset},(_,i)=><span key={"blank"+i}/>)}{Array.from({length:daysInMonth},(_,i)=>{const day=new Date(monthParts[0],monthParts[1]-1,i+1);const key=dateKey(day);const closed=closedDays.includes(day.toLocaleDateString("en-US",{weekday:"long"}).toLowerCase());const past=key<minDate;return <button type="button" key={key} disabled={past||closed} className={(selected===key?"selected ":"")+(closed?"closed":"")} aria-pressed={selected===key} title={closed?"Closed":undefined} onClick={()=>choose(key)}>{i+1}</button>})}</div>
   <p className="bb-calendar-note">{hoursConfigured?"Published opening hours: "+opening+"–"+closing+".":"Operating hours are not published in the customer settings yet; time preferences remain subject to confirmation."} {closedDays.length?"Closed days are excluded.":"Ask the Brothers to confirm any exceptional closure."}</p>
  </div>
  {selected&&<div className="bb-selected-wash"><div><span>YOUR PREFERRED VISIT</span><strong>{displayDate(selected)}</strong><small>{availabilityLoading?"Checking time options…":slots.length?"Preferred times checked against current availability":"Preferred time · subject to confirmation"}</small></div><label>Preferred time<select value={time} onChange={e=>setTime(e.target.value)}>{(slots.length?slots:timeSlots).map(slot=><option key={slot} value={slot}>{slot}</option>)}</select></label><button type="button" className="big-brothers-button primary" onClick={continueToRequest}>Continue with this day ↗</button></div>}
  {toast&&<p className="bb-planner-toast" role="status" aria-live="polite">{toast}</p>}
  <div className="bb-mobile-wash-inquiry"><div><strong>Rather have us come to you?</strong><p>Ask about a mobile wash at your home, office or another location. The Brothers will check coverage and confirm separately.</p></div><a className="big-brothers-button secondary" href="/?journey=book&mode=mobile#request">Enquire about a mobile wash ↗</a></div>
 </section>;
}
