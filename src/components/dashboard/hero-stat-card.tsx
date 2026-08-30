import { Sparkline, type SparklinePoint } from "@/components/charts/sparkline";

export function HeroStatCard({
  label,
  value,
  caption,
  trend,
}: {
  label: string;
  value: string;
  caption?: string;
  trend?: SparklinePoint[];
}) {
  return (
    <div
      className="flex flex-col justify-between rounded-2xl p-6 text-white"
      style={{ background: "var(--hero-gradient)" }}
    >
      <div>
        <p className="text-sm" style={{ color: "var(--hero-muted)" }}>
          {label}
        </p>
        <p className="mt-2 text-4xl font-semibold tracking-tight">{value}</p>
        {caption ? (
          <p className="mt-1 text-sm" style={{ color: "var(--hero-muted)" }}>
            {caption}
          </p>
        ) : null}
      </div>
      {trend && trend.length >= 2 ? (
        <div className="mt-6">
          <Sparkline points={trend} />
        </div>
      ) : null}
    </div>
  );
}
