import InviteAcceptance from "./InviteAcceptance";
export const metadata={title:"Friend invitation",description:"Accept a friend invitation on The Plug."};
export default async function InvitePage({params}:{params:Promise<{inviteId:string}>}){const {inviteId}=await params;return <InviteAcceptance inviteId={inviteId}/>;}
