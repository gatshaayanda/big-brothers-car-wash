import AdminGate from "@/app/admin/admin-gate";
import VulaDashboard from "@/app/admin/big-brothers-dashboard";
export const metadata = { title: "Staff operations", robots: { index: false, follow: false } };
export default function AdminPage() { return <AdminGate><VulaDashboard /></AdminGate>; }
