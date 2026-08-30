import { requireOrgAccess } from "@/lib/auth/requireOrgAccess";
import { listSiteVisitors } from "@/lib/visitors/service";
import { toErrorResponse } from "@/lib/api/respond";

// docs/visitor-data.md CRM export: "Also ship a plain CSV export and a
// webhook. Some merchants want the data somewhere we haven't integrated,
// and a webhook costs a day." This is the CSV half — no OAuth, no
// provider credentials needed, unlike the HubSpot/Salesforce/Klaviyo
// connectors (deferred; see docs/roadmap.md). Segment/behavior only,
// never a raw event stream ("What to sync" in that doc).
function toCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  try {
    const { organizationId } = await params;
    const { organization } = await requireOrgAccess(organizationId);
    const siteId = new URL(request.url).searchParams.get("siteId") ?? undefined;
    const visitors = await listSiteVisitors(organization.id, siteId);

    const header = [
      "visitorKey",
      "company",
      "interest",
      "stage",
      "intentScore",
      "device",
      "firstSeenAt",
      "lastSeenAt",
      "pageViewCount",
      "sessionCount",
      "converted",
    ];
    const rows = visitors.map((v) =>
      [
        v.visitorKey,
        v.company ?? "",
        v.interest ?? "",
        v.stage,
        String(v.intentScore),
        v.lastDevice ?? "",
        v.firstSeenAt,
        v.lastSeenAt,
        String(v.pageViewCount),
        String(v.sessionCount),
        String(v.converted),
      ]
        .map(toCsvField)
        .join(","),
    );
    const csv = [header.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="visitors.csv"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
