"use client";
import {onAuthStateChanged,signInWithCustomToken,signOut,type User} from "firebase/auth";
import {doc,onSnapshot} from "firebase/firestore";
import {useEffect,useState} from "react";
import {auth,db} from "@/lib/firebase/client";

function hasAdminRole(data:Record<string,unknown>|undefined){
 return ["owner","staff"].includes(String(data?.role??"").toLowerCase());
}

function friendlyAuthError(err:unknown){
 const code=typeof err==="object"&&err!==null&&"code" in err?String((err as {code?:unknown}).code):"";
 if(["auth/invalid-credential","auth/wrong-password","auth/user-not-found","auth/invalid-login-credentials"].includes(code)){
  return "Sign-in failed. Check your email and password and try again.";
 }
 if(code==="auth/too-many-requests") return "Too many sign-in attempts. Wait a moment and try again.";
 if(code==="auth/network-request-failed") return "We could not reach Firebase. Check your internet connection and try again.";
 return err instanceof Error?err.message:"We could not sign you in. Check your details.";
}

export default function AdminGate({children}:{children:React.ReactNode}){
 const[user,setUser]=useState<User|null>(null),[checking,setChecking]=useState(true),[authorized,setAuthorized]=useState(false),[offline,setOffline]=useState(false),[accessWord,setAccessWord]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);

 useEffect(()=>{
  let stopAdmin:undefined|(()=>void);
  const stopAuth=onAuthStateChanged(auth,next=>{
   if(stopAdmin){stopAdmin();stopAdmin=undefined}
   setUser(next);
   setChecking(true);
   setOffline(false);
   if(!next){setAuthorized(false);setChecking(false);return}
   stopAdmin=onSnapshot(doc(db,"admins",next.uid),snapshot=>{
    const allowed=snapshot.exists()&&hasAdminRole(snapshot.data());
    setAuthorized(allowed);
    setOffline(false);
    setChecking(false);
    if(!allowed)void signOut(auth);
   },()=>{
    setOffline(true);
    setChecking(false);
   });
  });
  return ()=>{if(stopAdmin)stopAdmin();stopAuth()};
 },[]);

 async function signIn(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError("");
  try{
   const response=await fetch("/api/operations-login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({word:accessWord})});
   const payload=await response.json() as {token?:string;error?:string};
   if(!response.ok||!payload.token)throw new Error(payload.error??"Access denied. Check the access word and try again.");
   const credential=await signInWithCustomToken(auth,payload.token);
   const adminSnapshot=await new Promise<{exists:boolean;data:()=>Record<string,unknown>}|null>(resolve=>{
    const stop=onSnapshot(doc(db,"admins",credential.user.uid),snapshot=>{stop();resolve({exists:snapshot.exists(),data:()=>snapshot.data()??{}})},()=>{stop();resolve(null)});
   });
   if(!adminSnapshot||!adminSnapshot.exists||!hasAdminRole(adminSnapshot.data())){
    setError("This account is not enabled for Iteration 13 Operations.");
    await signOut(auth);
   }else{setAuthorized(true);setOffline(false);setAccessWord("")}
  }catch(err){setError(friendlyAuthError(err))}
  finally{setBusy(false)}
 }

 if(checking)return <main className="adminPage"><div className="adminShell"><div className="emptyState"><div>🔐</div><h1>Opening Iteration 13 Admin</h1><p>Checking access…</p></div></div></main>;
 if(user&&authorized)return <div className="adminAuthorized">{offline&&<div className="adminAccountBar"><span>Iteration 13 Admin · Offline mode · cached admin access</span><span>Changes will sync when connection returns.</span></div>}<div className="adminAccountBar"><span>Iteration 13 Admin · {user.email??"authorized staff"}</span><button className="button buttonLight" type="button" onClick={()=>void signOut(auth)}>Sign out</button></div>{children}</div>;
 return <main className="adminPage"><div className="adminShell"><section className="adminPanel" style={{maxWidth:520,margin:"80px auto"}}><span className="kicker">Iteration 13 · Operations</span><h1>Operations sign in</h1><p>Enter your Operations access word to manage sourcing requests, catalogue and customer conversations.</p><form className="adminForm" onSubmit={signIn}><label>Access word<input type="password" value={accessWord} onChange={e=>setAccessWord(e.target.value)} autoComplete="current-password" required autoFocus/></label><button className="button buttonPrimary" type="submit" disabled={busy}>{busy?"Checking access…":"Enter Operations"}</button></form>{error&&<p role="alert" className="notice">{error}</p>}</section></div></main>
}
