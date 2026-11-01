import {NextResponse} from "next/server";
import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getMessaging} from "firebase-admin/messaging";
export const runtime="nodejs";
function app(){const raw=process.env.FIREBASE_ADMIN_KEY;if(!raw)throw new Error("The Plug notifications are not configured yet.");const existing=getApps()[0];if(existing)return existing;let serviceAccount:Record<string,unknown>;try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}catch{throw new Error("The Plug notification credentials are not valid JSON yet.")}return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])})}
export async function POST(request:Request){
 try{
  const header=request.headers.get("authorization")||"";const match=header.match(/^Bearer\s+(.+)$/i);if(!match)throw new Error("Missing Firebase authentication token.");
  const decoded=await getAuth(app()).verifyIdToken(match[1]);const body=await request.json().catch(()=>({})) as {deviceToken?:unknown};if(typeof body.deviceToken!=="string"||!body.deviceToken)throw new Error("This device is not registered for The Plug notifications yet.");
  const messaging=getMessaging(app());const title="The Plug notifications are on";const result=await messaging.send({token:body.deviceToken,notification:{title,body:"This device is ready for The Plug sourcing updates."},data:{title,body:"This device is ready for The Plug sourcing updates.",link:"/account",test:"true"},webpush:{fcmOptions:{link:(process.env.NEXT_PUBLIC_BASE_URL||"https://the-plug-pearl.vercel.app")+"/account"},notification:{tag:"the-plug-test",icon:"/plug-icon.svg",badge:"/plug-icon.svg"}}});
  void decoded;return NextResponse.json({sent:Boolean(result)});
 }catch(error){console.error("The Plug test notification failed:",error);return NextResponse.json({sent:false,error:error instanceof Error?error.message:"The Plug could not send the test notification."},{status:400})}
}
