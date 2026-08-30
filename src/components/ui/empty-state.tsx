export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-surface px-6 py-12">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="max-w-md text-sm text-muted">{description}</p>
      {action}
    </div>
  );
}
