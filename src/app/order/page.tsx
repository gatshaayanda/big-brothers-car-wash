import {redirect} from "next/navigation";
export const metadata={title:"Request a product",description:"Send The Plug a sneaker or apparel sourcing request."};
export default function OrderPage(){redirect("/request")}
