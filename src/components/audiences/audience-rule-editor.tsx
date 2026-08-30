"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type RuleRow = {
  field: string;
  operator: string;
  value: string;
  groupIndex: number;
};

const OPERATORS: { value: string; label: string }[] = [
  { value: "EQUALS", label: "equals" },
  { value: "NOT_EQUALS", label: "does not equal" },
  { value: "CONTAINS", label: "contains" },
  { value: "IN", label: "is one of (comma-separated)" },
  { value: "GREATER_THAN", label: "is greater than" },
  { value: "LESS_THAN", label: "is less than" },
  { value: "EXISTS", label: "is set" },
];

// Mirrors VisitorProfileForm's fields (src/components/liveview/visitor-profile-form.tsx)
// so an audience can be built from the same vocabulary Live View lets you
// simulate — "Custom field…" stays as an escape hatch for anything else
// (other attributes.* keys, or a field this list hasn't caught up to yet).
const FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "device", label: "Device" },
  { value: "geo.country", label: "Country" },
  { value: "geo.region", label: "Region" },
  { value: "geo.city", label: "City" },
  { value: "referrer", label: "Referrer" },
  { value: "utm.source", label: "UTM source" },
  { value: "utm.medium", label: "UTM medium" },
  { value: "utm.campaign", label: "UTM campaign" },
  { value: "utm.term", label: "UTM term" },
  { value: "utm.content", label: "UTM content" },
  { value: "returning", label: "Returning visitor" },
  { value: "sessionCount", label: "Session count" },
  // Real, automated data as of Phase 6 (docs/roadmap.md) — populated by
  // src/lib/enrichment/ipFirmographics.ts when a site opts into IP-based
  // enrichment, not just a Live View simulation placeholder like the two
  // below.
  { value: "attributes.company", label: "Company (from IP)" },
  { value: "attributes.industry", label: "Industry" },
  { value: "attributes.buyingIntent", label: "Buying intent" },
  // Real, automated data — the visitor's own accumulated behavior on this
  // site (src/lib/visitors/inferProfile.ts), fed in whenever a request
  // carries a recognized dynamify_vid cookie. Only ever matches anything
  // on a site with visitor tracking turned on (Sites page); on any other
  // site these silently never match, same failure-renders-default
  // posture as every other field here.
  { value: "attributes.stage", label: "Engagement stage (Visitors, requires tracking on)" },
  { value: "attributes.intentScore", label: "Intent score 0–1 (Visitors, requires tracking on)" },
];
const CUSTOM_FIELD = "__custom__";
const STAGE_FIELD = "attributes.stage";
const STAGES = ["awareness", "consideration", "evaluation"];

function isKnownField(field: string): boolean {
  return FIELD_OPTIONS.some((o) => o.value === field);
}

type IndexedRow = { row: RuleRow; index: number };

function groupRules(rules: RuleRow[]): { groupIndex: number; rows: IndexedRow[] }[] {
  const groups = new Map<number, IndexedRow[]>();
  rules.forEach((row, index) => {
    const list = groups.get(row.groupIndex) ?? [];
    list.push({ row, index });
    groups.set(row.groupIndex, list);
  });
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([groupIndex, rows]) => ({ groupIndex, rows }));
}

// Rows sharing a group are ANDed; separate groups are ORed (disjunctive
// normal form — docs/decisions.md D6). Rendered as visual OR-separated
// groups of AND-connected conditions rather than a raw "group: <number>"
// field, so the logic reads without needing the DNF vocabulary explained.
export function AudienceRuleEditor({
  rules,
  onChange,
}: {
  rules: RuleRow[];
  onChange: (rules: RuleRow[]) => void;
}) {
  function update(index: number, patch: Partial<RuleRow>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function remove(index: number) {
    onChange(rules.filter((_, i) => i !== index));
  }

  function addToGroup(groupIndex: number) {
    onChange([...rules, { field: "device", operator: "EQUALS", value: "", groupIndex }]);
  }

  function addGroup() {
    const maxGroup = rules.reduce((max, r) => Math.max(max, r.groupIndex), -1);
    onChange([...rules, { field: "device", operator: "EQUALS", value: "", groupIndex: maxGroup + 1 }]);
  }

  function removeGroup(groupIndex: number) {
    onChange(rules.filter((r) => r.groupIndex !== groupIndex));
  }

  const groups = groupRules(rules);

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 ? (
        <p className="text-xs text-muted">No conditions yet — this audience matches everyone.</p>
      ) : null}

      {groups.map((group, gi) => (
        <div key={group.groupIndex}>
          {gi > 0 ? (
            <div className="my-2 flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium uppercase tracking-wide text-muted">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          ) : null}

          <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
            {group.rows.map(({ row, index }, ri) => {
              const selectValue = isKnownField(row.field) ? row.field : CUSTOM_FIELD;
              return (
                <div key={index} className="flex flex-col gap-1">
                  {ri > 0 ? (
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted">and</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={selectValue}
                      onChange={(e) => {
                        const v = e.target.value;
                        update(index, { field: v === CUSTOM_FIELD ? "" : v });
                      }}
                      className="rounded-md border border-border bg-surface px-2 py-2 text-sm"
                    >
                      {FIELD_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                      <option value={CUSTOM_FIELD}>Custom field…</option>
                    </select>
                    {selectValue === CUSTOM_FIELD ? (
                      <Input
                        placeholder="e.g. attributes.companySize"
                        value={row.field}
                        onChange={(e) => update(index, { field: e.target.value })}
                        className="w-44"
                      />
                    ) : null}
                    <select
                      value={row.operator}
                      onChange={(e) => update(index, { operator: e.target.value })}
                      className="rounded-md border border-border bg-surface px-2 py-2 text-sm"
                    >
                      {OPERATORS.map((op) => (
                        <option key={op.value} value={op.value}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                    {row.field === STAGE_FIELD ? (
                      // A free-text value here would silently never match
                      // on any typo (EQUALS is exact) — a dropdown of the
                      // three real stage values this app ever produces
                      // (src/lib/visitors/inferProfile.ts) makes that
                      // failure mode structurally impossible instead.
                      <select
                        value={row.value}
                        onChange={(e) => update(index, { value: e.target.value })}
                        className="rounded-md border border-border bg-surface px-2 py-2 text-sm"
                      >
                        <option value="">Choose a stage…</option>
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        placeholder="value"
                        value={row.value}
                        onChange={(e) => update(index, { value: e.target.value })}
                        className="w-32"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-xs text-muted underline underline-offset-2"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => addToGroup(group.groupIndex)}
                className="self-start text-xs text-muted underline underline-offset-2"
              >
                + Add AND condition
              </button>
              {groups.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeGroup(group.groupIndex)}
                  className="self-start text-xs text-muted underline underline-offset-2"
                >
                  Remove this group
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ))}

      <Button type="button" variant="secondary" onClick={addGroup} className="self-start">
        + Add OR group
      </Button>
    </div>
  );
}
