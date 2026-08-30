type Variant = "positive" | "neutral" | "danger";

// Consolidates the pill formula already copy-pasted identically across
// Sites/Analytics/Visitors/Settings/Live View — see docs/roadmap.md's
// dashboard-shell redesign note. Existing pages keep their inline version
// for now; this is for new shell-level usage, not a retrofit.
const VARIANT_CLASSES: Record<Variant, string> = {
  positive: "border-transparent bg-[var(--status-positive)]/10 text-[var(--status-positive)]",
  neutral: "border-border text-muted",
  danger: "border-transparent bg-danger/10 text-danger",
};

export function Badge({
  variant = "neutral",
  className = "",
  children,
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </span>
  );
}
