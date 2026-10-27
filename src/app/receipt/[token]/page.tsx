import ReceiptView from "./ReceiptView";

export const metadata = {
  title: "Secure wash receipt · Big Brothers Car Wash",
  description: "View, download and securely claim a completed Big Brothers Car Wash receipt.",
  robots: { index: false, follow: false },
};

export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ReceiptView token={token} />;
}
