"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, Download, Trash2, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SiteVisitorDTO } from "@/lib/visitors/dto";
import type { VisitorDetail } from "@/lib/visitors/dsr";

const STAGE_LABEL: Record<string, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  evaluation: "Evaluation",
};

const STAGE_STYLE: Record<string, string> = {
  evaluation: "border-transparent bg-[var(--status-positive)]/10 text-[var(--status-positive)]",
  consideration: "border-border text-foreground",
  awareness: "border-border text-muted",
};

const DEVICE_LABEL: Record<string, string> = {
  desktop: "Desktop",
  mobile: "Mobile",
  tablet: "Tablet",
};

// A fixed locale, not the visitor's own (`undefined`) — this is a "use
// client" component, so these run during both SSR and hydration; the
// server process and the browser can default to different locales
// (e.g. en-US vs fi-FI), and "Aug 8" vs "8.8." for the same Date is a
// real hydration mismatch, not a hypothetical one. Fixed to match this
// app's own English-only UI copy, not tied to the visitor's OS locale.
const DATE_LOCALE = "en-US";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(DATE_LOCALE, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(DATE_LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function truncateKey(key: string): string {
  return key.length > 12 ? `${key.slice(0, 12)}…` : key;
}

function VisitorDetailPanel({
  organizationId,
  visitor,
  onDeleted,
}: {
  organizationId: string;
  visitor: SiteVisitorDTO;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<VisitorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch(`/api/organizations/${organizationId}/visitors/${visitor.id}/detail`)
      .then((res) => res.json())
      .then((data) => setDetail(data))
      .finally(() => setLoading(false));
    // Deliberately runs once, on mount (this component is only ever
    // mounted while its row is expanded — see VisitorsTable below) —
    // organizationId/visitor.id are stable for its whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportData() {
    setExporting(true);
    try {
      const res = await fetch(`/api/organizations/${organizationId}/visitors/${visitor.id}`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `visitor-${visitor.visitorKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function deleteVisitor() {
    setDeleting(true);
    try {
      await fetch(`/api/organizations/${organizationId}/visitors/${visitor.id}`, { method: "DELETE" });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge variant={visitor.consentState.analytics ? "positive" : "neutral"}>
            Analytics {visitor.consentState.analytics ? "on" : "off"}
          </Badge>
          <Badge variant={visitor.consentState.personalization ? "positive" : "neutral"}>
            Personalization {visitor.consentState.personalization ? "on" : "off"}
          </Badge>
          {visitor.hasPerson ? (
            <Badge variant="neutral" className="gap-1">
              <UserCheck size={11} />
              Person linked
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" disabled={exporting} onClick={exportData} className="gap-1.5 text-xs">
            <Download size={13} />
            {exporting ? "Exporting…" : "Export data"}
          </Button>
          {confirmingDelete ? (
            <>
              <span className="text-xs text-muted">Delete this visitor&apos;s data permanently?</span>
              <Button type="button" variant="danger" disabled={deleting} onClick={deleteVisitor} className="text-xs">
                {deleting ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)} className="text-xs">
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmingDelete(true)}
              className="gap-1.5 text-xs"
            >
              <Trash2 size={13} />
              Delete visitor
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-muted">Loading…</p>
      ) : !detail || detail.sessions.length === 0 ? (
        <p className="text-xs text-muted">No session history yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {detail.sessions.map((session) => (
            <div key={session.id} className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="font-medium text-foreground">{formatDateTime(session.startedAt)}</span>
                {session.device ? <span>{DEVICE_LABEL[session.device] ?? session.device}</span> : null}
                {session.geoCountry ? <span>{session.geoCountry}</span> : null}
                {session.referrer ? <span className="truncate">from {session.referrer}</span> : null}
                <span>
                  {session.pageViewCount} {session.pageViewCount === 1 ? "page view" : "page views"}
                </span>
              </div>
              {session.impressions.length > 0 ? (
                <ul className="flex flex-col gap-1.5">
                  {session.impressions.map((imp, i) => (
                    <li key={i} className="text-xs text-foreground">
                      Matched <span className="font-medium">{imp.audienceName}</span> — shown &quot;{imp.content}
                      &quot;
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Nothing personalized in this session.</p>
              )}
              {session.conversions.length > 0 ? (
                <p className="mt-1.5 text-xs text-[var(--status-positive)]">
                  {session.conversions.length === 1 ? "1 conversion" : `${session.conversions.length} conversions`}{" "}
                  in this session.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VisitorsTable({
  organizationId,
  visitors: initialVisitors,
}: {
  organizationId: string;
  visitors: SiteVisitorDTO[];
}) {
  const [visitors, setVisitors] = useState(initialVisitors);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="max-w-2xl text-xs text-muted">
          Company-level by default — resolved from a visitor&apos;s IP, never a person. Person-level detail
          only ever appears when a visitor volunteers it (a form, a login) — we never deanonymize anonymous
          visitors.
        </p>
        <a
          href={`/api/organizations/${organizationId}/visitors/export`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
        >
          <Download size={13} />
          Export all as CSV
        </a>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-3 font-medium">Visitor</th>
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Interest</th>
              <th className="px-4 py-3 font-medium">Intent</th>
              <th className="px-4 py-3 font-medium">Device</th>
              <th className="px-4 py-3 font-medium">First seen</th>
              <th className="px-4 py-3 font-medium">Last seen</th>
              <th className="px-4 py-3 font-medium">Sessions</th>
              <th className="px-4 py-3 font-medium">Converted</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visitors.map((visitor) => {
              const expanded = expandedId === visitor.id;
              return (
                <Fragment key={visitor.id}>
                  <tr
                    className="cursor-pointer hover:bg-background"
                    onClick={() => setExpandedId(expanded ? null : visitor.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{truncateKey(visitor.visitorKey)}</td>
                    <td className="px-4 py-3 text-foreground">{visitor.company ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3 text-foreground">{visitor.interest ?? <span className="text-muted">—</span>}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs ${STAGE_STYLE[visitor.stage] ?? STAGE_STYLE.awareness}`}
                        title="Inferred from page views, distinct pages, and CTA clicks — a heuristic, not a measurement"
                      >
                        {STAGE_LABEL[visitor.stage] ?? visitor.stage} · {Math.round(visitor.intentScore * 100)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {visitor.lastDevice ? DEVICE_LABEL[visitor.lastDevice] ?? visitor.lastDevice : <span className="text-muted">—</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{formatDate(visitor.firstSeenAt)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(visitor.lastSeenAt)}</td>
                    <td className="px-4 py-3 text-foreground">{visitor.sessionCount}</td>
                    <td className="px-4 py-3">
                      {visitor.converted ? (
                        <span className="whitespace-nowrap rounded-full border border-transparent bg-[var(--status-positive)]/10 px-2.5 py-0.5 text-xs text-[var(--status-positive)]">
                          Yes
                        </span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 text-xs text-muted">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronDown size={14} className={`text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td colSpan={10} className="border-b border-border bg-background p-0">
                        <VisitorDetailPanel
                          organizationId={organizationId}
                          visitor={visitor}
                          onDeleted={() => {
                            setVisitors((vs) => vs.filter((v) => v.id !== visitor.id));
                            setExpandedId(null);
                          }}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
