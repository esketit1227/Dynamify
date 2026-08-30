import { randomBytes } from "node:crypto";

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "org";
}

export function slugWithSuffix(base: string): string {
  return `${base}-${randomBytes(3).toString("hex")}`;
}
