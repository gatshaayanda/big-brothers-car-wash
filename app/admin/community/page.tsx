import AdminGate from "@/app/admin/admin-gate";
import AdminCommunityDashboard from "./admin-community-dashboard";
export const metadata={title:"Community publishing",description:"Publish completed finds using members’ privacy choices."};
export default function AdminCommunityPage(){return <AdminGate><AdminCommunityDashboard/></AdminGate>}
