export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Dynamify
          </span>
        </div>
        <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
