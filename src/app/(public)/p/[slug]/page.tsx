import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPublishedPageBySlug } from "@/lib/pages/publicService";
import { getActiveCampaignForPage } from "@/lib/campaigns/assignment";
import { PersonalizedPage } from "@/components/public/personalized-page";

// D3: geo from hosting-provider edge headers only — never a blocking
// lookup. Covers the common header names (Vercel, Cloudflare); absent
// everywhere else, which is a normal, handled case (VisitorContext.geo is
// optional).
async function getGeoFromHeaders() {
  const h = await headers();
  const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? undefined;
  const region = h.get("x-vercel-ip-country-region") ?? undefined;
  const city = h.get("x-vercel-ip-city") ?? undefined;
  if (!country && !region && !city) return undefined;
  return { country, region, city };
}

export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const published = await getPublishedPageBySlug(slug);

  if (!published) notFound();

  const geo = await getGeoFromHeaders();
  const campaign = await getActiveCampaignForPage(published.pageId);

  return (
    <PersonalizedPage
      definition={published.definition}
      geo={geo}
      campaignId={campaign?.id}
    />
  );
}
