import {NextResponse} from "next/server";
import {cert,getApp,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";

export const runtime="nodejs";

function getAdminApp(){
  if(getApps().length)return getApp();
  const raw=process.env.FIREBASE_ADMIN_KEY;
  if(!raw)throw new Error("Firebase Admin is not configured.");
  let serviceAccount:Record<string,unknown>;
  try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}
  catch{throw new Error("FIREBASE_ADMIN_KEY is not valid JSON.")}
  return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])});
}

async function requireUid(request:Request){
  const header=request.headers.get("authorization")||"";
  const match=header.match(/^Bearer\s+(.+)$/i);
  if(!match)throw new Error("Missing Firebase authentication token.");
  return (await getAuth(getAdminApp()).verifyIdToken(match[1])).uid;
}

export async function POST(request:Request){
  try{
    const uid=await requireUid(request);
    const {orderId}=await request.json() as {orderId?:unknown};
    if(typeof orderId!=="string"||!orderId)throw new Error("Missing order ID.");
    const {sendNewOrderNotifications}=await import("@/lib/server/pickup-reminder-runner");
    const result=await sendNewOrderNotifications(orderId,uid);
    return NextResponse.json(result);
  }catch(error){
    console.error("The Plug new-order notification failed:",error);
    return NextResponse.json({sent:0,error:error instanceof Error?error.message:"The Plug could not notify operations."},{status:400});
  }
}
