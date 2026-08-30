"use client";

import { useState } from "react";

export type BarPoint = { label: string; value: number };

// Direct-labeled bars (dataviz skill: selective direct labels rather than a
// number on every point would still apply for a denser chart, but this is
// meant for small counts — 4-8 bars — where direct labels read cleanly) plus
// a per-mark hover tooltip. The last bar is emphasized in --chart-bar-strong
// to mark "current" — a status distinction, not a categorical one, so it's
// one hue with a single darker step, not a rainbow.
export function BarChart({ points, height = 160 }: { points: BarPoint[]; height?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {points.map((point, i) => {
        const barHeight = Math.max((point.value / max) * (height - 28), 4);
        const isLast = i === points.length - 1;
        const isHovered = hoverIndex === i;
        return (
          <div
            key={point.label}
            className="relative flex flex-1 flex-col items-center justify-end gap-1.5"
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {isHovered ? (
              <div className="pointer-events-none absolute -top-2 -translate-y-full rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-lg">
                {point.value.toLocaleString()}
              </div>
            ) : (
              <span className="text-xs font-medium text-foreground">{point.value}</span>
            )}
            <div
              className="w-full rounded-md transition-opacity"
              style={{
                height: barHeight,
                backgroundColor: isLast ? "var(--chart-bar-strong)" : "var(--chart-bar)",
                opacity: isHovered ? 0.85 : 1,
              }}
            />
            <span className="text-xs text-muted">{point.label}</span>
          </div>
        );
      })}
    </div>
  );
}
