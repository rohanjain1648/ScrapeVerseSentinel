import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets "jsx": "preserve" (Next.js transforms JSX itself at build time),
  // so esbuild needs to be told explicitly to use the automatic (React 19) JSX runtime
  // when compiling .tsx test/lib files under Vitest.
  esbuild: {
    jsx: "automatic"
  },
  test: {
    // Most chaos-lab tests (e.g. versionApi.test.ts) exercise Next.js route handlers
    // and don't need a DOM, so the default environment stays "node" for speed.
    // layoutVersions.test.tsx renders React components and queries the DOM via
    // @testing-library/react, so it opts into jsdom per-file with a
    // `// @vitest-environment jsdom` docblock at the top of that file instead of
    // paying the jsdom setup cost for every test in this app.
    environment: "node"
  }
});
