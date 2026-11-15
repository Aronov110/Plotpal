// Must come first: it sets Zod up before any module makes a schema (see the module for why).
import "./lib/zod-config.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installStaleChunkReload } from "./lib/navigation/reload-on-stale-chunk.ts";
// The two fonts are served by this app itself (nothing is loaded from another site).
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/newsreader";
import "./components/ions/tokens.css";

// A tab opened before a new version went live asks for screen files that no longer exist: reload once.
installStaleChunkReload();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
