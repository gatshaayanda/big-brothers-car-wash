import AdminGate from "@/app/admin/admin-gate";
import StorefrontPublishing from "@/components/StorefrontPublishing";
export const metadata={title:"Storefront Studio",robots:{index:false,follow:false}};
export default function StorefrontAdminPage(){return <AdminGate><StorefrontPublishing/></AdminGate>;}