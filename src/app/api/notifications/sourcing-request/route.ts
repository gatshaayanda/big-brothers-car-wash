import {NextResponse} from "next/server";
import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
import {getAuth} from "firebase-admin/auth";

export const runtime="nodejs";
function app(){
 const raw=process.env.FIREBASE_ADMIN_KEY;
 if(!raw)throw new Error("The Plug notifications are not configured yet.");
 const existing=getApps()[0];if(existing)return existing;
 let serviceAccount:Record<string,unknown>;try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}catch{throw new Error("The Plug notification credentials are not valid JSON yet.")}
 return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])});
}
async function verifyUid(request:Request){
 const header=request.headers.get("authorization")||"";const match=header.match(/^Bearer\s+(.+)$/i);
 if(!match)throw new Error("Missing authentication token.");
 return getAuth(app()).verifyIdToken(match[1]);
}
export async function POST(request:Request){
 try{
  const decoded=await verifyUid(request);const {requestId}=await request.json() as {requestId?:unknown};
  if(typeof requestId!=="string"||!requestId)throw new Error("Missing request ID.");
  const db=getFirestore(app()),messaging=getMessaging(app());const snap=await db.collection("sourcingRequests").doc(requestId).get();
  if(!snap.exists)throw new Error("Sourcing request not found.");
  if(String(snap.data()?.customerId??"")!==decoded.uid)throw new Error("Request does not belong to this customer.");
  const data=snap.data()??{},admins=await db.collection("admins").get();let sent=0;
  for(const admin of admins.docs){
   const pref=(await db.collection("notificationPreferences").doc(admin.id).get()).data();if(!pref?.enabled)continue;
   const tokens=await db.collection("notificationTokens").doc(admin.id).collection("tokens").get();
   for(const token of tokens.docs){try{await messaging.send({token:String(token.data().token),notification:{title:"New The Plug sourcing request",body:String(data.customerName??"Customer")+" · "+String(data.product??"Product")},data:{link:"/admin",requestId},webpush:{fcmOptions:{link:(process.env.NEXT_PUBLIC_BASE_URL||"https://the-plug-pearl.vercel.app")+"/admin"}}});sent++}catch{}}
  }
  return NextResponse.json({sent});
 }catch(error){console.error("The Plug sourcing notification failed:",error);return NextResponse.json({sent:0,error:error instanceof Error?error.message:"Notification unavailable while The Plug is being built."},{status:400})}
}
