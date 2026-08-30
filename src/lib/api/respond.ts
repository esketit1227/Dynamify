import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError, RateLimitedError } from "@/lib/auth/errors";

// Route handlers throw typed errors and let this catch them at the boundary,
// so every handler shapes its success response but shares one error shape.
export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request", issues: error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  if (error instanceof RateLimitedError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Retry-After": Math.ceil(error.retryAfterMs / 1000).toString() },
      },
    );
  }

  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("Unhandled route error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
