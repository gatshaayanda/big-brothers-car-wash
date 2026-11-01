"use client";
import {useEffect,useRef,useState} from "react";
import {addDoc,collection,serverTimestamp} from "firebase/firestore";
import {getDownloadURL,ref,uploadBytes} from "firebase/storage";
import {auth,db,storage} from "@/lib/firebase/client";
import {createCustomerConversation,subscribeToConversation,updateConversationRead,recordConversationMessage,type Conversation,type ConversationMessage} from "@/lib/firebase/data";

const MAX_FILE_SIZE=10*1024*1024;
const allowed=(file:File)=>file.type.startsWith("image/")||file.type==="application/pdf";

function timeText(value:string){const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString([], {dateStyle:"medium",timeStyle:"short"}):""}

export default function ConversationPanel({conversationId,conversationTitle,onBack}:{conversationId?:string;conversationTitle?:string;onBack?:()=>void}){
 const[user,setUser]=useState(auth.currentUser),[activeConversationId,setActiveConversationId]=useState(conversationId),[conversation,setConversation]=useState<Conversation|null>(null),[messages,setMessages]=useState<ConversationMessage[]>([]),[text,setText]=useState(""),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),bottomRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{const stop=auth.onAuthStateChanged(()=>setUser(auth.currentUser));return stop},[]);
 useEffect(()=>{setActiveConversationId(conversationId)},[conversationId]);
 useEffect(()=>{if(!activeConversationId){setConversation(null);setMessages([]);return}const stop=subscribeToConversation(activeConversationId,setConversation,setMessages,error=>setNotice(error.message));void updateConversationRead(activeConversationId,"customer").catch(error=>setNotice(error instanceof Error?error.message:"Conversation read state could not be updated."));return stop},[activeConversationId]);
 useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"})},[messages.length]);

 async function send(){
  if(!user||(!activeConversationId&&!conversationTitle)||(!text.trim()&&!file))return;
  setBusy(true);setNotice("");
  try{
   let attachment:ConversationMessage["attachment"]=undefined;
   const currentConversationId=activeConversationId||await createCustomerConversation(user.uid,conversationTitle||"Question");
   if(!activeConversationId)setActiveConversationId(currentConversationId);
   const messageRef=collection(db,"conversations",currentConversationId,"messages");
   const messageId=crypto.randomUUID();
   if(file){
    if(!allowed(file))throw new Error("Please attach an image or PDF.");
    if(file.size>MAX_FILE_SIZE)throw new Error("Attachments must be 10 MB or smaller.");
    const storageRef=ref(storage,`conversationAttachments/${currentConversationId}/${messageId}/${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`);
    const uploaded=await uploadBytes(storageRef,file,{contentType:file.type});
    attachment={url:await getDownloadURL(uploaded.ref),name:file.name,type:file.type,size:file.size};
   }
   const body=text.trim();
   await addDoc(messageRef,{senderId:user.uid,senderRole:"customer",text:body,attachment:attachment??null,createdAt:new Date().toISOString(),createdAtServer:serverTimestamp()});
   await recordConversationMessage(currentConversationId,"customer",body||("Attachment: "+(attachment?.name||"file")));
   setText("");setFile(null);
   const input=document.getElementById("theplug-conversation-file") as HTMLInputElement|null;if(input)input.value="";
   const response=await fetch("/api/notifications/message-created",{method:"POST",headers:{Authorization:"Bearer "+(await user.getIdToken()),"Content-Type":"application/json"},body:JSON.stringify({conversationId:currentConversationId,messageId})});
   if(!response.ok)setNotice("Message sent. The Plug could not send the instant alert, but the message is saved.");
  }catch(error){setNotice(error instanceof Error?error.message:"Your message could not be sent.")}
  finally{setBusy(false)}
 }
 if(!activeConversationId&&!conversationTitle)return null;
 return <section className="conversationPanel">
  <div className="conversationHeader"><div><span className="kicker">Talk to The Plug</span><h2>{conversation?.title||conversationTitle||"Conversation"}</h2><p>Ask a question, make a product request or send details for a bulk order.</p></div>{onBack&&<button className="button buttonLight" onClick={onBack}>Back</button>}</div>
  <div className="messageList" aria-live="polite">
   {messages.length===0&&<div className="conversationEmpty"><strong>Start the conversation.</strong><p>Tell The Plug what you need. You can add a photo or PDF when it helps explain the request.</p></div>}
   {messages.map(message=><article className={"messageBubble "+(message.senderRole==="customer"?"messageMine":"messageThem")} key={message.id}><div className="messageRole">{message.senderRole==="customer"?"You":"The Plug"} · {timeText(message.createdAt)}</div>{message.text&&<p>{message.text}</p>}{message.attachment&&<a className="messageAttachment" href={message.attachment.url} target="_blank" rel="noreferrer">{message.attachment.type.startsWith("image/")?"🖼️":"📄"} {message.attachment.name}<small>{Math.max(1,Math.round(message.attachment.size/1024))} KB · Open</small></a>}</article>)}
   <div ref={bottomRef}/>
  </div>
  <div className="messageComposer"><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Write to The Plug…" rows={3} maxLength={2000}/><div className="composerActions"><label className="attachmentButton">📎 {file?"Attached":"Add photo or PDF"}<input id="theplug-conversation-file" type="file" accept="image/*,application/pdf" hidden onChange={e=>{const next=e.target.files?.[0]??null;if(next&&!allowed(next)){setNotice("Please choose an image or PDF.") ;return}if(next&&next.size>MAX_FILE_SIZE){setNotice("Attachments must be 10 MB or smaller.");return}setFile(next);setNotice("")}}/></label>{file&&<button className="fileRemove" type="button" onClick={()=>{setFile(null);const input=document.getElementById("theplug-conversation-file") as HTMLInputElement|null;if(input)input.value=""}}>Remove {file.name}</button>}<button className="button buttonPrimary" type="button" disabled={busy||(!text.trim()&&!file)} onClick={()=>void send()}>{busy?"Sending…":"Send"}</button></div>{notice&&<p className="notice" role="status">{notice}</p>}<small className="orderTruth">Images and PDFs are optional. The Plug staff will see your message in Business Inbox.</small></div>
 </section>
}