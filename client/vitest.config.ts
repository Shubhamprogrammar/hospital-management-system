import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Deterministic env for the api client / socket hooks (env.ts reads these at import time).
    env: {
      NEXT_PUBLIC_API_URL: "http://test.local/api/v1",
      NEXT_PUBLIC_SOCKET_URL: "http://test.local",
    },
  },
});
