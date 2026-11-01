"use client";
import {getMessaging,isSupported,type Messaging} from "firebase/messaging";
import {app} from "@/lib/firebase/client";
let messagingPromise:Promise<Messaging|null>|null=null;
export function getMessagingInstance(){if(!messagingPromise){messagingPromise=isSupported().then(supported=>supported?getMessaging(app):null)}return messagingPromise.then(value=>{if(!value)throw new Error("This browser does not support The Plug push notifications.");return value})}
