import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/api/respond";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
