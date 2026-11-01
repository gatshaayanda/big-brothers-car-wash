import {NextResponse} from "next/server";
import {cert,getApps,initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";
export const runtime="nodejs";
function app(){const raw=process.env.FIREBASE_ADMIN_KEY;if(!raw)throw new Error("The Plug notifications are not configured yet.");const existing=getApps()[0];if(existing)return existing;let serviceAccount:Record<string,unknown>;try{serviceAccount=JSON.parse(raw) as Record<string,unknown>}catch{throw new Error("The Plug notification credentials are not valid JSON yet.")}return initializeApp({credential:cert(serviceAccount as Parameters<typeof cert>[0])})}
export async function POST(request:Request){
 try{
  const a=app();const header=request.headers.get("authorization")||"";const match=header.match(/^Bearer\s+(.+)$/i);if(!match)throw new Error("Missing authentication token.");
  const uid=(await getAuth(a).verifyIdToken(match[1])).uid;const {conversationId,messageId}=await request.json() as {conversationId?:unknown;messageId?:unknown};if(typeof conversationId!=="string"||typeof messageId!=="string")throw new Error("Missing conversation message identifiers.");
  const db=getFirestore(a),messaging=getMessaging(a);const conversation=await db.collection("conversations").doc(conversationId).get();const message=await db.collection("conversations").doc(conversationId).collection("messages").doc(messageId).get();
  if(!conversation.exists||!message.exists)throw new Error("Conversation message not found.");
  const data=conversation.data()??{},msg=message.data()??{};if(String(msg.senderId??"")!==uid)throw new Error("Message does not belong to this sender.");
  const admins=await db.collection("admins").get();const senderRole=String(msg.senderRole??"");const recipientIds:string[]=[];
  if(senderRole==="customer"){for(const admin of admins.docs){const pref=(await db.collection("notificationPreferences").doc(admin.id).get()).data();if(pref?.enabled)recipientIds.push(admin.id)}}else{const customerId=String(data.customerId??"");if(customerId)recipientIds.push(customerId)}
  let sent=0;const preview=String(msg.text??"Attachment sent").slice(0,120);const title=senderRole==="customer"?String(data.customerName??"Customer")+" sent a message":"The Plug replied";
  for(const recipient of recipientIds){const tokens=await db.collection("notificationTokens").doc(recipient).collection("tokens").get();for(const token of tokens.docs){try{await messaging.send({token:String(token.data().token),notification:{title,body:preview},data:{link:senderRole==="customer"?"/admin":"/account",conversationId,messageId},webpush:{fcmOptions:{link:(process.env.NEXT_PUBLIC_BASE_URL||"https://the-plug-pearl.vercel.app")+(senderRole==="customer"?"/admin":"/account")}}});sent++}catch{}}}
  return NextResponse.json({sent});
 }catch(error){console.error("The Plug conversation notification failed:",error);return NextResponse.json({sent:0,error:error instanceof Error?error.message:"Conversation notification unavailable while The Plug is being built."},{status:400})}
}
