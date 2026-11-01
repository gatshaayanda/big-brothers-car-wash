import {NextResponse} from "next/server";
import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,type DocumentData} from "firebase-admin/firestore";

export const runtime="nodejs";

function adminApp(){
  const existing=getApps()[0];
  if(existing)return existing;
  const raw=process.env.FIREBASE_ADMIN_KEY;
  if(!raw)throw new Error("The sourcing request service is not configured.");
  let serviceAccount:Record<string,unknown>;
  try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}
  catch{throw new Error("The sourcing request service credentials are invalid.");}
  return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])});
}

function validRequestData(data:Record<string,unknown>,uid:string){
  const allowed=["customerId","customerName","phone","product","size","colour","notes","attachment","createdAt","updatedAt","status","deliveryMethod"];
  if(Object.keys(data).some(key=>!allowed.includes(key)))return false;
  if(!allowed.every(key=>Object.prototype.hasOwnProperty.call(data,key)))return false;
  if(data.customerId!==uid||typeof data.customerName!=="string"||!data.customerName.trim()||data.customerName.length>120)return false;
  if(typeof data.phone!=="string"||!data.phone.trim()||data.phone.length>60)return false;
  if(typeof data.product!=="string"||!data.product.trim()||data.product.length>500)return false;
  if(typeof data.size!=="string"||data.size.length>100||typeof data.colour!=="string"||data.colour.length>100)return false;
  if(typeof data.notes!=="string"||data.notes.length>5000)return false;
  if(typeof data.createdAt!=="string"||typeof data.updatedAt!=="string"||data.status!=="New Request")return false;
  if(data.deliveryMethod!=="delivery"&&data.deliveryMethod!=="collection")return false;
  if(data.attachment!==null){
    if(!data.attachment||typeof data.attachment!=="object"||Array.isArray(data.attachment))return false;
    const attachment=data.attachment as Record<string,unknown>;
    if(Object.keys(attachment).some(key=>!["url","name","type","size"].includes(key)))return false;
    if(typeof attachment.url!=="string"||!attachment.url.startsWith("https://")||typeof attachment.name!=="string"||attachment.name.length>255||typeof attachment.type!=="string"||attachment.type.length>120||typeof attachment.size!=="number"||!Number.isFinite(attachment.size)||attachment.size<0||attachment.size>4*1024*1024)return false;
  }
  return true;
}

export async function POST(request:Request){
  try{
    const match=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
    if(!match)return NextResponse.json({error:"Your private session expired. Retry the request."},{status:401});
    const app=adminApp();
    const decoded=await getAuth(app).verifyIdToken(match[1]);
    const body=await request.json() as {requestId?:unknown;data?:unknown};
    if(typeof body.requestId!=="string"||!/^[A-Za-z0-9_-]{10,128}$/.test(body.requestId))return NextResponse.json({error:"Invalid request reference."},{status:400});
    if(!body.data||typeof body.data!=="object"||Array.isArray(body.data))return NextResponse.json({error:"Request details are missing."},{status:400});
    const data=body.data as Record<string,unknown>;
    if(!validRequestData(data,decoded.uid))return NextResponse.json({error:"Some request details could not be validated. Check the form and retry."},{status:400});
    const db=getFirestore(app),ref=db.collection("sourcingRequests").doc(body.requestId);
    const result=await db.runTransaction(async tx=>{
      const existing=await tx.get(ref);
      if(existing.exists){
        const saved=existing.data()??{};
        if(saved.customerId===decoded.uid&&saved.product===data.product&&saved.customerName===data.customerName)return {id:ref.id,duplicate:true};
        throw new Error("That request reference already exists. Please refresh My requests before retrying.");
      }
      tx.create(ref,data as DocumentData);
      return {id:ref.id,duplicate:false};
    });
    return NextResponse.json({requestId:result.id,alreadySaved:result.duplicate},{status:result.duplicate?200:201});
  }catch(error){
    console.error("[The Plug] sourcing request save failed:",error);
    const message=error instanceof Error?error.message:"The request could not be saved.";
    const status=/expired|token|authentication/i.test(message)?401:400;
    return NextResponse.json({error:message},{status});
  }
}
