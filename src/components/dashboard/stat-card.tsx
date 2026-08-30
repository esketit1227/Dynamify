import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  children,
}: {
  label: string;
  value: string;
  caption?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted">{label}</p>
          {Icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-foreground">
              <Icon size={16} />
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
        {caption ? <p className="mt-1 text-sm text-muted">{caption}</p> : null}
      </div>
      {children ? <div className="mt-6">{children}</div> : null}
    </Card>
  );
}
