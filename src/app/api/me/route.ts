import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { getCurrentOrgForUser } from "@/lib/organizations/current";
import { toErrorResponse } from "@/lib/api/respond";

export async function GET() {
  try {
    const user = await requireSession();
    const organization = await getCurrentOrgForUser(user.id);

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name },
      organization,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
