import {NextResponse} from "next/server";
import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";

export const runtime="nodejs";

function adminApp(){
 const raw=process.env.FIREBASE_ADMIN_KEY;
 if(!raw)throw new Error("The Plug notifications are not configured yet.");
 const existing=getApps()[0];
 if(existing)return existing;
 let serviceAccount:Record<string,unknown>;
 try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}catch{throw new Error("The Plug notification credentials are not valid JSON yet.")}
 return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])});
}

export async function POST(request:Request){
 try{
  const app=adminApp();
  const match=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
  if(!match)throw new Error("Missing Firebase authentication token.");
  const uid=(await getAuth(app).verifyIdToken(match[1])).uid;
  const db=getFirestore(app);
  const adminDoc=await db.collection("admins").doc(uid).get();
  if(!adminDoc.exists||!["owner","staff"].includes(String(adminDoc.data()?.role||"").toLowerCase())){
   return NextResponse.json({sent:0,error:"Only The Plug staff can send request updates."},{status:403});
  }

  const {requestId}=await request.json() as {requestId?:unknown};
  if(typeof requestId!=="string"||!requestId)throw new Error("Missing request ID.");
  const snap=await db.collection("sourcingRequests").doc(requestId).get();
  if(!snap.exists)throw new Error("Sourcing request not found.");
  const data=snap.data()??{};
  const customerId=String(data.customerId??"");
  if(!customerId)throw new Error("Sourcing request has no customer account.");

  const pref=(await db.collection("notificationPreferences").doc(customerId).get()).data();
  if(!pref?.enabled)return NextResponse.json({sent:0,reason:"customer-notifications-disabled"});
  const tokens=await db.collection("notificationTokens").doc(customerId).collection("tokens").get();
  if(tokens.empty)return NextResponse.json({sent:0,reason:"customer-device-not-registered"});

  const messaging=getMessaging(app);
  const title="The Plug request updated";
  const body=String(data.status??"Your request has been updated.")+(data.quotedPrice!==undefined?" · Quote P"+Number(data.quotedPrice).toFixed(2):"");
  const baseUrl=process.env.NEXT_PUBLIC_BASE_URL||"https://the-plug-pearl.vercel.app";
  let sent=0;
  const failures:string[]=[];
  for(const tokenDoc of tokens.docs){
   const token=String(tokenDoc.data().token??"");
   if(!token)continue;
   try{
    await messaging.send({
     token,
     notification:{title,body},
     data:{title,body,link:"/account#requests",requestId},
     webpush:{
      fcmOptions:{link:baseUrl+"/account#requests"},
      notification:{tag:"the-plug-request-"+requestId,icon:"/plug-icon.svg",badge:"/plug-icon.svg"}
     }
    });
    sent++;
   }catch(error){
    const code=(error as {code?:string})?.code||"unknown";
    failures.push(code);
    if(code==="messaging/registration-token-not-registered"||code==="messaging/invalid-registration-token"){
     await tokenDoc.ref.delete().catch(()=>{});
    }
   }
  }
  return NextResponse.json({sent,failures});
 }catch(error){
  console.error("The Plug request notification failed:",error);
  return NextResponse.json({sent:0,error:error instanceof Error?error.message:"The Plug request notification failed."},{status:400});
 }
}
