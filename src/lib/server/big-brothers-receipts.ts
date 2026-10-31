import { createHash, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function bigBrothersAdminApp() {
  const existing = getApps().find(app => app.name === "big-brothers-operations");
  if (existing) return existing;
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) throw new Error("Secure receipts require FIREBASE_ADMIN_KEY on the server.");
  let serviceAccount: Record<string, unknown>;
  try { serviceAccount = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("FIREBASE_ADMIN_KEY must contain valid service-account JSON."); }
  return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: "vulas-car-wash" }, "big-brothers-operations");
}

export async function requireBigBrothersStaff(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("Staff sign-in is required.");
  const app = bigBrothersAdminApp();
  const decoded = await getAuth(app).verifyIdToken(token);
  const admin = await getFirestore(app).doc(`admins/${decoded.uid}`).get();
  if (!admin.exists || !["owner", "staff"].includes(String(admin.data()?.role))) throw new Error("Staff access is required.");
  return { app, uid: decoded.uid };
}

export async function createWalkInTicketReceipt(queueEntryId: string, job: Record<string, unknown>) {
  const app = bigBrothersAdminApp();
  const db = getFirestore(app);
  const receiptRef = db.doc(`receipts/${queueEntryId}`);
  const now = new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  return db.runTransaction(async transaction => {
    const existing = await transaction.get(receiptRef);
    const current = existing.data() || {};
    const currentToken = String(current.token || "");
    const currentExpiry = Date.parse(String(current.expiresAt || ""));
    if (existing.exists && current.revoked !== true
      && /^[A-Za-z0-9_-]{40,80}$/.test(currentToken)
      && current.tokenHash === receiptTokenHash(currentToken)
      && Number.isFinite(currentExpiry) && currentExpiry > Date.now()) {
      return { token: currentToken, receiptRef: String(current.receiptRef || ""), reused: true };
    }

    const token = createReceiptToken();
    const tokenHash = receiptTokenHash(token);
    const receiptNumber = "BB-" + createdAt.slice(0, 10).replaceAll("-", "") + "-" + token.slice(0, 6).toUpperCase();
    const publishedPrice = typeof job.servicePrice === "number" && Number.isFinite(job.servicePrice) ? job.servicePrice : null;
    const proposedPrice = typeof job.customerOfferAmount === "number" && Number.isFinite(job.customerOfferAmount) ? job.customerOfferAmount : null;
    const agreedPrice = typeof job.agreedWashPrice === "number" && Number.isFinite(job.agreedWashPrice) ? job.agreedWashPrice : null;
    const priceNote = agreedPrice !== null
      ? "Face-to-face agreed wash price: BWP " + agreedPrice.toFixed(2)
      : publishedPrice !== null
        ? "Published service price: BWP " + publishedPrice.toFixed(2) + " (final charge may be confirmed at the wash)"
        : proposedPrice !== null
          ? "Customer-proposed amount: BWP " + proposedPrice.toFixed(2) + " (not yet accepted; final price to be agreed)"
          : "Final wash price to be agreed with Big Brothers.";
    const record = {
      queueEntryId, token, tokenHash, receiptRef: receiptNumber,
      receiptKind: "walk-in-ticket",
      priceNote,
      customerId: String(job.customerId || ""),
      customerName: String(job.customerName || ""),
      phone: String(job.phone || ""),
      email: String(job.email || ""),
      vehicleType: String(job.vehicleType || ""),
      vehicleRegistration: String(job.vehicleRegistration || ""),
      serviceName: String(job.serviceName || "Car wash service"),
      amount: agreedPrice ?? publishedPrice ?? 0,
      tipAmount: 0,
      paymentStatus: "not-due",
      paymentMethod: "not-recorded",
      joinedAt: String(job.createdAt || createdAt),
      completedAt: "",
      createdAt,
      expiresAt,
      revoked: false,
      ...(current.claimedBy ? { claimedBy: current.claimedBy, claimedAt: current.claimedAt } : {}),
    };
    transaction.set(receiptRef, record);
    transaction.set(db.doc(`receiptTokens/${tokenHash}`), { queueEntryId, createdAt, expiresAt });
    return { token, receiptRef: receiptNumber, reused: false };
  });
}

export function receiptTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createReceiptToken() {
  return randomBytes(32).toString("base64url");
}

export async function readReceiptByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) return null;
  const app = bigBrothersAdminApp();
  const db = getFirestore(app);
  const tokenRecord = await db.doc(`receiptTokens/${receiptTokenHash(token)}`).get();
  if (!tokenRecord.exists) return null;
  const queueEntryId = String(tokenRecord.data()?.queueEntryId || "");
  if (!queueEntryId) return null;
  const ref = db.doc(`receipts/${queueEntryId}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const receipt = snap.data() || {};
  if (receipt.revoked === true || receipt.tokenHash !== receiptTokenHash(token)) return null;
  const expiry = Date.parse(String(receipt.expiresAt || ""));
  if (!Number.isFinite(expiry) || expiry <= Date.now()) return null;
  return { app, ref, queueEntryId, receipt };
}

export type PublicReceipt = {
  receiptRef: string;
  receiptKind: string;
  priceNote: string;
  businessName: string;
  locationName: string;
  customerName: string;
  phone: string;
  email: string;
  vehicleType: string;
  vehicleRegistration: string;
  serviceName: string;
  amount: number;
  tipAmount: number;
  paymentStatus: string;
  paymentMethod: string;
  joinedAt: string;
  completedAt: string;
  createdAt: string;
  expiresAt: string;
  claimed: boolean;
};

export function publicReceipt(receipt: Record<string, unknown>): PublicReceipt {
  return {
    receiptRef: String(receipt.receiptRef || ""),
    receiptKind: String(receipt.receiptKind || "completed-receipt"),
    priceNote: String(receipt.priceNote || ""),
    businessName: "Big Brothers Car Wash",
    locationName: "G-West, Botswana",
    customerName: String(receipt.customerName || ""),
    phone: String(receipt.phone || ""),
    email: String(receipt.email || ""),
    vehicleType: String(receipt.vehicleType || ""),
    vehicleRegistration: String(receipt.vehicleRegistration || ""),
    serviceName: String(receipt.serviceName || "Car wash service"),
    amount: Number(receipt.amount || 0),
    tipAmount: Number(receipt.tipAmount || 0),
    paymentStatus: String(receipt.paymentStatus || "unpaid"),
    paymentMethod: String(receipt.paymentMethod || "not-recorded"),
    joinedAt: String(receipt.joinedAt || ""),
    completedAt: String(receipt.completedAt || ""),
    createdAt: String(receipt.createdAt || ""),
    expiresAt: String(receipt.expiresAt || ""),
    claimed: Boolean(receipt.claimedBy),
  };
}

function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[^\x20-\x7E]/g, "");
}

export function createReceiptPdf(receipt: PublicReceipt) {
  const lines: Array<{ text: string; size: number; color: string }> = [
    { text: receipt.businessName.toUpperCase(), size: 20, color: "0.08 0.13 0.11" },
    { text: receipt.locationName, size: 10, color: "0.32 0.38 0.34" },
    { text: receipt.receiptKind === "walk-in-ticket" ? "WALK-IN RECEIPT" : "CAR WASH RECEIPT", size: 15, color: "0.08 0.13 0.11" },
    { text: "Receipt reference: " + receipt.receiptRef, size: 10, color: "0.08 0.13 0.11" },
    { text: (receipt.receiptKind === "walk-in-ticket" ? "Joined: " : "Completed: ") + (receipt.receiptKind === "walk-in-ticket" ? (receipt.joinedAt ? new Date(receipt.joinedAt).toLocaleString("en-BW", { timeZone: "Africa/Gaborone" }) : "Not recorded") : (receipt.completedAt ? new Date(receipt.completedAt).toLocaleString("en-BW", { timeZone: "Africa/Gaborone" }) : "Not recorded")), size: 10, color: "0.08 0.13 0.11" },
    { text: "", size: 8, color: "0 0 0" },
    { text: "CUSTOMER", size: 10, color: "0.25 0.32 0.27" },
    { text: "Name: " + receipt.customerName, size: 11, color: "0.08 0.13 0.11" },
    { text: "Phone: " + receipt.phone, size: 11, color: "0.08 0.13 0.11" },
    { text: "VEHICLE & SERVICE", size: 10, color: "0.25 0.32 0.27" },
    { text: "Vehicle: " + receipt.vehicleType, size: 11, color: "0.08 0.13 0.11" },
    { text: "Service: " + receipt.serviceName, size: 11, color: "0.08 0.13 0.11" },
    { text: "", size: 8, color: "0 0 0" },
    { text: receipt.receiptKind === "walk-in-ticket" ? "PRICE INFORMATION" : "FINAL AGREED CHARGE", size: 10, color: "0.25 0.32 0.27" },
    { text: receipt.receiptKind === "walk-in-ticket" ? receipt.priceNote : "BWP " + receipt.amount.toFixed(2), size: receipt.receiptKind === "walk-in-ticket" ? 12 : 22, color: "0.08 0.13 0.11" },
    ...(receipt.receiptKind === "walk-in-ticket" ? [] : [
      { text: "Voluntary tip: BWP " + receipt.tipAmount.toFixed(2), size: 11, color: "0.08 0.13 0.11" },
      { text: "Total recorded: BWP " + (receipt.amount + receipt.tipAmount).toFixed(2), size: 13, color: "0.08 0.13 0.11" },
      { text: "Payment method: " + receipt.paymentMethod.toUpperCase().replaceAll("-", " "), size: 10, color: "0.08 0.13 0.11" },
    ]),
    { text: "Payment status: " + receipt.paymentStatus.toUpperCase(), size: 11, color: "0.08 0.13 0.11" },
    { text: "", size: 10, color: "0 0 0" },
    { text: receipt.receiptKind === "walk-in-ticket" ? "This confirms your walk-in details were recorded. It is not a completed-wash or payment receipt." : "This receipt records the details and payment status entered by staff.", size: 9, color: "0.32 0.38 0.34" },
    { text: receipt.receiptKind === "walk-in-ticket" ? "Any proposed price remains subject to agreement at the wash." : "It is not proof of payment unless the status above says PAID.", size: 9, color: "0.32 0.38 0.34" },
  ];
  let y = 780;
  const ops = ["q", "0.96 0.98 0.94 rg", "40 720 515 92 re f", "Q", "0.78 0.95 0.42 rg", "40 712 515 5 re f"];
  for (const line of lines) {
    if (!line.text) { y -= line.size + 8; continue; }
    ops.push(line.color + " rg");
    ops.push("BT /F1 " + line.size + " Tf 52 " + y + " Td (" + pdfEscape(line.text) + ") Tj ET");
    y -= line.size + 15;
  }
  ops.push("0.78 0.95 0.42 rg", "40 40 515 4 re f");
  const stream = ops.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream, "ascii") + " >>\nstream\n" + stream + "\nendstream",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "ascii");
    pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
  });
  const xref = Buffer.byteLength(pdf, "ascii");
  pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index++) pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \n";
  pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(pdf, "ascii");
}
