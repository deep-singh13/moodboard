import { defineConfig } from "vitest/config";
import path from "path";

// Deliberately standalone rather than extending vite.config.ts: that config
// throws unless PORT and BASE_PATH are set, which is right for a dev server and
// wrong for a test run. Only the "@" alias is shared, so it is repeated here.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
});
