import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // The personalization engine lives in packages/sdk as a real workspace
  // package (not just a path alias) — this tells Next to compile its raw
  // TS source rather than treating it as pre-built node_modules code.
  transpilePackages: ["@dynamify/personalization-sdk"],
};

export default nextConfig;
