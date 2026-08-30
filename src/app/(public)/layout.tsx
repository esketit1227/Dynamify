// No dashboard chrome — public pages are the product's actual output, not
// part of the app shell.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
