import { redirect } from "next/navigation";

export const metadata = { title: "Service request", description: "Start a service request from the Iteration 13 Service Studio." };

export default function RequestPage() {
  redirect("/#service-order");
}
