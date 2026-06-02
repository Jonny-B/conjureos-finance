/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two build outputs from the same source:
//   - `npm run build`        → dist/ with JS + CSS as separate files (default).
//   - `npm run build:inline` → dist/index.html, fully self-contained (JS + CSS
//                              inlined). This is what the ConjureOS App Store
//                              ingests — the kernel's srcdoc iframe needs one
//                              HTML string with everything inside.
// The split lives in a Vite mode flag: `vite build --mode inline`.
export default defineConfig(({ mode }) => {
  const inline = mode === "inline";
  return {
    plugins: [react(), ...(inline ? [viteSingleFile()] : [])],
    server: { port: 5174 },
    build: {
      target: "es2022",
      sourcemap: !inline,
      ...(inline
        ? {
            assetsInlineLimit: 100_000_000, // inline every asset regardless of size
            cssCodeSplit: false,
            rollupOptions: { output: { inlineDynamicImports: true } },
          }
        : {}),
    },
    test: {
      environment: "jsdom",
      globals: true,
    },
  };
});
