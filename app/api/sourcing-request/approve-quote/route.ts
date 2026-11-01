import {NextResponse} from "next/server";
import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";

export const runtime="nodejs";

function adminApp(){
  if(getApps().length)return getApps()[0];
  const raw=process.env.FIREBASE_ADMIN_KEY;
  if(!raw)throw new Error("Quote approval is not available right now. Please try again later.");
  let serviceAccount:Record<string,unknown>;
  try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}
  catch{throw new Error("Quote approval is not configured correctly. Please contact The Plug.");
  }
  return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])});
}

export async function POST(request:Request){
  try{
    const match=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
    if(!match)return NextResponse.json({error:"Please restore your session and try again."},{status:401});
    const app=adminApp();
    const token=await getAuth(app).verifyIdToken(match[1]);
    const body=await request.json() as {requestId?:unknown};
    if(typeof body.requestId!=="string"||!body.requestId.trim())return NextResponse.json({error:"Missing request reference."},{status:400});
    const db=getFirestore(app);
    const ref=db.collection("sourcingRequests").doc(body.requestId);
    const now=new Date().toISOString();
    const result=await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw new Error("This sourcing request could not be found.");
      const data=snap.data()??{};
      if(data.customerId!==token.uid)return {status:403 as const,error:"This request does not belong to the signed-in account."};
      if(typeof data.quotedPrice!=="number"||!Number.isFinite(data.quotedPrice)||data.quotedPrice<0)return {status:409 as const,error:"Frank has not added a confirmed quote yet."};
      if(!["Quote Ready","Awaiting Deposit"].includes(String(data.status)))return {status:409 as const,error:"This quote is not awaiting approval. Refresh My Plug to see the latest status."};
      if(data.customerApprovedAt&&data.customerApprovedPrice===data.quotedPrice)return {status:200 as const,approvedAt:String(data.customerApprovedAt),alreadyApproved:true};
      tx.update(ref,{customerApprovedAt:now,customerApprovedPrice:data.quotedPrice,customerApprovalSource:"my-plug",customerApprovalUid:token.uid,status:"Awaiting Deposit",updatedAt:now});
      return {status:200 as const,approvedAt:now,alreadyApproved:false};
    });
    if(result.status!==200)return NextResponse.json({error:result.error},{status:result.status});
    return NextResponse.json({approved:true,approvedAt:result.approvedAt,alreadyApproved:result.alreadyApproved});
  }catch(error){
    console.error("The Plug quote approval failed:",error);
    return NextResponse.json({error:error instanceof Error?error.message:"We could not record your approval. Please try again."},{status:400});
  }
}
