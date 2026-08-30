import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-background disabled:opacity-50",
  ghost:
    "bg-transparent text-foreground hover:bg-surface disabled:opacity-50",
  // Tinted text-on-background, matching Badge's danger variant — not a
  // solid red fill, since --danger is lighter in dark mode and a solid
  // fill with white text would fail contrast there.
  danger:
    "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20 disabled:opacity-50",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(({ className = "", variant = "primary", ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
});
Button.displayName = "Button";
