"use client";

import { useState, useId } from "react";

export type SparklinePoint = { label: string; value: number };

// A line+area sparkline with a hover crosshair/tooltip (dataviz skill: an
// SVG chart *is* interactive — ship the hover layer by default). Designed
// to sit on the dark hero gradient card: white line/fill, white tooltip.
export function Sparkline({
  points,
  height = 160,
}: {
  points: SparklinePoint[];
  height?: number;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 600;
  const padding = 8;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => ({
    x: padding + (i / (points.length - 1)) * (width - padding * 2),
    y: padding + (1 - (p.value - min) / range) * (height - padding * 2),
  }));

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${height} L ${coords[0].x} ${height} Z`;

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredCoord = hoverIndex !== null ? coords[hoverIndex] : null;

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let nearestDist = Infinity;
    coords.forEach((c, i) => {
      const dist = Math.abs(c.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label={`Trend from ${points[0].label} to ${points[points.length - 1].label}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.28" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
        {hoveredCoord ? (
          <>
            <line
              x1={hoveredCoord.x}
              x2={hoveredCoord.x}
              y1={padding}
              y2={height - padding}
              stroke="white"
              strokeOpacity="0.35"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={hoveredCoord.x} cy={hoveredCoord.y} r="4" fill="white" />
          </>
        ) : null}
      </svg>
      {hovered && hoveredCoord ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-white px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(hoveredCoord.x / width) * 100}%`,
            top: `${(hoveredCoord.y / height) * 100}%`,
            marginTop: "-8px",
          }}
        >
          <p className="font-medium text-[#17171a]">{hovered.label}</p>
          <p className="text-[#6f6e6a]">{hovered.value.toLocaleString()}</p>
        </div>
      ) : null}
    </div>
  );
}
