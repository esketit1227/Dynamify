import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    setupFiles: ["./tests/setup/env.ts"],
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    fileParallelism: false,
  },
});
