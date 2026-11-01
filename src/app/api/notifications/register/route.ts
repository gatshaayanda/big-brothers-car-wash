import { createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function adminApp() {
  const existing = getApps().find(app => app.name === "big-brothers-operations");
  if (existing) return existing;
  const raw = process.env.FIREBASE_ADMIN_KEY;
  if (!raw) throw new Error("Notification registration is not configured on the server.");
  let serviceAccount: Record<string, unknown>;
  try { serviceAccount = JSON.parse(raw) as Record<string, unknown>; }
  catch { throw new Error("Server notification credentials are not valid JSON."); }
  return initializeApp({ credential: cert(serviceAccount as Parameters<typeof cert>[0]), projectId: "vulas-car-wash" }, "big-brothers-operations");
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ error: "Sign in before registering notifications." }, { status: 401 });
    const app = adminApp();
    const decoded = await getAuth(app).verifyIdToken(token);
    const body = await request.json().catch(() => null) as { token?: unknown } | null;
    if (typeof body?.token !== "string" || body.token.length < 20 || body.token.length > 4096) {
      return NextResponse.json({ error: "The notification token is invalid." }, { status: 400 });
    }
    const tokenId = createHash("sha256").update(body.token).digest("hex");
    await getFirestore(app).doc(`notificationTokens/${decoded.uid}/tokens/${tokenId}`).set({
      token: body.token,
      admin: false,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return NextResponse.json({ registered: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Big Brothers notification registration failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "Notifications could not be registered. Check server configuration and try again." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
