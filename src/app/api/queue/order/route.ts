import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { requireBigBrothersStaff } from "@/lib/server/big-brothers-receipts";

export const runtime = "nodejs";

function queueOrderError(error: unknown) {
  const message = error instanceof Error ? error.message : "Queue order could not be saved.";
  const status = /staff sign-in/i.test(message) ? 401
    : /staff access/i.test(message) ? 403
    : message === "QUEUE_ENTRY_NOT_FOUND" ? 404
    : message === "QUEUE_ENTRY_NOT_ACTIVE" || message === "QUEUE_TOO_LARGE" ? 409
    : 400;
  const safeMessage = message === "QUEUE_ENTRY_NOT_FOUND" ? "That queue entry could not be found."
    : message === "QUEUE_ENTRY_NOT_ACTIVE" ? "Only waiting or in-service jobs can be reordered."
    : message === "QUEUE_TOO_LARGE" ? "There are too many active jobs to reorder safely in one operation. Contact support."
    : /staff sign-in|staff access/i.test(message) ? message
    : "Queue order could not be saved. Please retry.";
  return NextResponse.json({ error: safeMessage }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const { app } = await requireBigBrothersStaff(request);
    const body = await request.json().catch(() => null) as {
      queueEntryId?: unknown;
      position?: unknown;
      estimatedWaitMinutes?: unknown;
    } | null;
    const queueEntryId = typeof body?.queueEntryId === "string" ? body.queueEntryId.trim() : "";
    const position = body?.position;
    const wait = body?.estimatedWaitMinutes;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(queueEntryId)) {
      return NextResponse.json({ error: "Choose a valid queue entry." }, { status: 400 });
    }
    if (typeof position !== "number" || !Number.isInteger(position) || position < 1 || position > 500) {
      return NextResponse.json({ error: "Queue position must be a whole number from 1 to 500." }, { status: 400 });
    }
    if (wait !== null && (typeof wait !== "number" || !Number.isInteger(wait) || wait < 0 || wait > 1440)) {
      return NextResponse.json({ error: "Wait estimate must be a whole number from 0 to 1,440 minutes, or left blank." }, { status: 400 });
    }

    const db = getFirestore(app);
    const targetRef = db.doc("queueEntries/" + queueEntryId);
    const now = new Date().toISOString();
    const updatedCount = await db.runTransaction(async transaction => {
      const targetSnap = await transaction.get(targetRef);
      if (!targetSnap.exists) throw new Error("QUEUE_ENTRY_NOT_FOUND");
      const target = targetSnap.data() || {};
      if (!["waiting", "in-service"].includes(String(target.status))) throw new Error("QUEUE_ENTRY_NOT_ACTIVE");

      const activeQuery = db.collection("queueEntries").where("status", "in", ["waiting", "in-service"]);
      const activeSnap = await transaction.get(activeQuery);
      if (activeSnap.size > 450) throw new Error("QUEUE_TOO_LARGE");
      const ordered = activeSnap.docs.map(snapshot => ({
        ref: snapshot.ref,
        id: snapshot.id,
        data: snapshot.data(),
      })).sort((a, b) => {
        const aPosition = Number(a.data.queuePosition), bPosition = Number(b.data.queuePosition);
        const aHas = Number.isFinite(aPosition) && aPosition > 0;
        const bHas = Number.isFinite(bPosition) && bPosition > 0;
        if (aHas && bHas && aPosition !== bPosition) return aPosition - bPosition;
        if (aHas !== bHas) return aHas ? -1 : 1;
        const byArrival = String(a.data.createdAt || "").localeCompare(String(b.data.createdAt || ""));
        return byArrival || a.id.localeCompare(b.id);
      });
      const currentIndex = ordered.findIndex(item => item.id === queueEntryId);
      if (currentIndex < 0) throw new Error("QUEUE_ENTRY_NOT_ACTIVE");
      const [moving] = ordered.splice(currentIndex, 1);
      ordered.splice(Math.min(position - 1, ordered.length), 0, moving);
      ordered.forEach((item, index) => {
        transaction.update(item.ref, {
          queuePosition: index + 1,
          updatedAt: now,
          ...(item.id === queueEntryId ? { estimatedWaitMinutes: wait } : {}),
        });
      });
      return ordered.length;
    });
    return NextResponse.json({ updated: true, updatedCount }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return queueOrderError(error);
  }
}
