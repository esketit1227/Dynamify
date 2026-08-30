"use client";

import { useEffect, useState } from "react";
import type { VisitorContext } from "@dynamify/personalization-sdk";
import { Input } from "@/components/ui/input";

const DEVICES: NonNullable<VisitorContext["device"]>[] = ["desktop", "mobile", "tablet", "unknown"];

const INDUSTRIES = [
  "Technology / SaaS",
  "E-commerce / Retail",
  "Financial Services",
  "Healthcare",
  "Manufacturing",
  "Education",
  "Media & Entertainment",
  "Professional Services",
  "Other",
];

const BUYING_INTENTS = ["Low", "Medium", "High"];

// The three real values src/lib/visitors/inferProfile.ts ever produces —
// unlike industry/buyingIntent above (simulation-only placeholders with
// no real producer), a tracked visitor's actual stage really is one of
// these, so previewing against anything else would be misleading.
const STAGES = ["awareness", "consideration", "evaluation"];

type AttributeRow = { key: string; value: string };

function buildContext(state: {
  device: NonNullable<VisitorContext["device"]>;
  country: string;
  region: string;
  city: string;
  referrer: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  returning: boolean;
  sessionCount: string;
  industry: string;
  buyingIntent: string;
  stage: string;
  intentScore: string;
  attributes: AttributeRow[];
}): VisitorContext {
  const geo =
    state.country || state.region || state.city
      ? {
          country: state.country || undefined,
          region: state.region || undefined,
          city: state.city || undefined,
        }
      : undefined;

  const utm =
    state.utmSource || state.utmMedium || state.utmCampaign || state.utmTerm || state.utmContent
      ? {
          source: state.utmSource || undefined,
          medium: state.utmMedium || undefined,
          campaign: state.utmCampaign || undefined,
          term: state.utmTerm || undefined,
          content: state.utmContent || undefined,
        }
      : undefined;

  const attributes = state.attributes.reduce<Record<string, string>>((acc, row) => {
    if (row.key.trim()) acc[row.key.trim()] = row.value;
    return acc;
  }, {});
  if (state.industry) attributes.industry = state.industry;
  if (state.buyingIntent) attributes.buyingIntent = state.buyingIntent;
  if (state.stage) attributes.stage = state.stage;
  if (state.intentScore.trim() && Number.isFinite(Number(state.intentScore))) {
    attributes.intentScore = state.intentScore;
  }

  const sessionCount = state.sessionCount.trim() ? Number(state.sessionCount) : undefined;

  return {
    device: state.device,
    geo,
    referrer: state.referrer || undefined,
    utm,
    returning: state.returning,
    sessionCount: Number.isFinite(sessionCount) ? sessionCount : undefined,
    attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
  };
}

// The one form for the full VisitorContext shape (packages/sdk/src/types.ts)
// — device, full geo, referrer, all five UTM fields, returning, session
// count, and free-form custom attributes. Used by both Live View and the
// demo window, which previously duplicated a 4-field subset (device,
// country, utm_source, returning) inline.
export function VisitorProfileForm({
  onChange,
  initialDevice = "desktop",
}: {
  onChange: (context: VisitorContext) => void;
  initialDevice?: NonNullable<VisitorContext["device"]>;
}) {
  const [device, setDevice] = useState<NonNullable<VisitorContext["device"]>>(initialDevice);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [referrer, setReferrer] = useState("");
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [returning, setReturning] = useState(false);
  const [sessionCount, setSessionCount] = useState("");
  const [industry, setIndustry] = useState("");
  const [buyingIntent, setBuyingIntent] = useState("");
  const [stage, setStage] = useState("");
  const [intentScore, setIntentScore] = useState("");
  const [attributes, setAttributes] = useState<AttributeRow[]>([]);
  const [utmExpanded, setUtmExpanded] = useState(false);

  useEffect(() => {
    onChange(
      buildContext({
        device,
        country,
        region,
        city,
        referrer,
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        returning,
        sessionCount,
        industry,
        buyingIntent,
        stage,
        intentScore,
        attributes,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    device,
    country,
    region,
    city,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    returning,
    sessionCount,
    industry,
    buyingIntent,
    stage,
    intentScore,
    attributes,
  ]);

  function updateAttribute(index: number, patch: Partial<AttributeRow>) {
    setAttributes((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Device</label>
        <select
          value={device}
          onChange={(e) => setDevice(e.target.value as NonNullable<VisitorContext["device"]>)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {DEVICES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Industry</label>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Buying intent</label>
          <select
            value={buyingIntent}
            onChange={(e) => setBuyingIntent(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            {BUYING_INTENTS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Engagement stage</label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Not set</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Intent score (0–1)</label>
          <Input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={intentScore}
            onChange={(e) => setIntentScore(e.target.value)}
            placeholder="0.8"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Country</label>
          <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Finland" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Region</label>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Uusimaa" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">City</label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Helsinki" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Referrer</label>
        <Input
          value={referrer}
          onChange={(e) => setReferrer(e.target.value)}
          placeholder="https://google.com"
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setUtmExpanded((v) => !v)}
          className="text-left text-xs font-medium uppercase tracking-wide text-muted underline underline-offset-2"
        >
          {utmExpanded ? "Hide" : "Show"} UTM parameters
        </button>
        {utmExpanded ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">utm_source</label>
              <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="linkedin" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">utm_medium</label>
              <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="social" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">utm_campaign</label>
              <Input
                value={utmCampaign}
                onChange={(e) => setUtmCampaign(e.target.value)}
                placeholder="launch"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">utm_term</label>
              <Input value={utmTerm} onChange={(e) => setUtmTerm(e.target.value)} placeholder="ai tools" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">utm_content</label>
              <Input
                value={utmContent}
                onChange={(e) => setUtmContent(e.target.value)}
                placeholder="hero-cta"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Session count</label>
          <Input
            type="number"
            min={0}
            value={sessionCount}
            onChange={(e) => setSessionCount(e.target.value)}
            placeholder="1"
          />
        </div>
        <label className="mt-5 flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={returning} onChange={(e) => setReturning(e.target.checked)} />
          Returning visitor
        </label>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Custom attributes</label>
        <div className="flex flex-col gap-2">
          {attributes.map((row, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={row.key}
                onChange={(e) => updateAttribute(i, { key: e.target.value })}
                placeholder="companySize"
              />
              <Input
                value={row.value}
                onChange={(e) => updateAttribute(i, { value: e.target.value })}
                placeholder="enterprise"
              />
              <button
                type="button"
                onClick={() => setAttributes((rows) => rows.filter((_, idx) => idx !== i))}
                className="shrink-0 px-2 text-xs text-muted underline underline-offset-2"
              >
                Remove
              </button>
            </div>
          ))}
          {attributes.length < 10 ? (
            <button
              type="button"
              onClick={() => setAttributes((rows) => [...rows, { key: "", value: "" }])}
              className="self-start text-xs text-muted underline underline-offset-2"
            >
              + Add attribute
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
