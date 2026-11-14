import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import { createApiProxy } from "./src/lib/dev-proxy.ts";

/**
 * The headers Vercel puts on every page (vercel.json), so that `vite preview` serves the built app
 * under the very same Content Security Policy and the rest. The development server does not: its
 * hot reloading needs inline scripts that the policy forbids.
 */
function productionHeaders(): Record<string, string> {
  // Next to this file. The test runner gives the file an address that is not a file path, so then the
  // folder the command runs in (apps/web) is used.
  const file = import.meta.url.startsWith("file:")
    ? join(dirname(fileURLToPath(import.meta.url)), "vercel.json")
    : join(process.cwd(), "vercel.json");
  const config = JSON.parse(readFileSync(file, "utf8")) as {
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const rule = config.headers.find((entry) => entry.source === "/(.*)");
  if (rule === undefined) throw new Error('vercel.json has no header rule for "/(.*)"');
  return Object.fromEntries(rule.headers.map((header) => [header.key, header.value]));
}

export default defineConfig(({ mode }) => {
  // Only `API_URL` is read from the environment (and from apps/web/.env*). It is optional.
  const proxy = createApiProxy(loadEnv(mode, ".", "API_").API_URL);

  return {
    plugins: [react()],
    server: { host: "127.0.0.1", port: 5173, proxy },
    // `vite preview` serves the production build; it needs the same forwarding to reach the API.
    preview: { host: "127.0.0.1", port: 4173, proxy, headers: productionHeaders() },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test-setup.ts"],
      // The browser tests in e2e/ run with Playwright (`bun run test:e2e`), not with Vitest.
      exclude: [...configDefaults.exclude, "e2e/**"],
      // CSS is ignored in tests (jsdom does no layout) except the tokens file, whose colors are
      // read by tokens.test.ts to check their contrast.
      css: { include: /tokens\.css/ },
    },
  };
});
