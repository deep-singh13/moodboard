import { defineConfig } from "vitest/config";

// Standalone rather than sharing config with anything else: this package has
// no dev-server config to diverge from, but keeping it explicit matches the
// moodboard package's vitest.config.ts.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
