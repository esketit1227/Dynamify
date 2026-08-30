import { type InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}
