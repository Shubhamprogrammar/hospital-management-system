/**
 * Build-time safety net for the Prisma generated client.
 *
 * Prisma's generated client (src/generated/prisma/client.ts) contains:
 *
 *   globalThis['__dirname'] = path.dirname(fileURLToPath(import.meta.url))
 *
 * The build pipeline runs `tsc-esm-fix` after `tsc`, and tsc-esm-fix (v3)
 * rewrites every `__dirname` occurrence into an `import.meta`-based expression
 * (its `dirnameVar` fix is ON by default). That rewrite of the line above
 * emits INVALID JavaScript:
 *
 *   globalThis['`${process.platform === 'win32' ? '' : '/'}${/file:\/{2,3}(.+)\/[^/]/.exec(import.meta.url)[1]}`'] = ...
 *   SyntaxError: Unexpected identifier 'win32'
 *
 * which crashes the deployed server at module load (seen on Render, Node 24,
 * Linux). This script renames the throwaway global key so tsc-esm-fix has
 * nothing to rewrite. Nothing in the generated client reads this key back, so
 * runtime behaviour is unchanged.
 *
 * If the generated code changes such that a `__dirname` reference survives,
 * the build FAILS loudly instead of shipping a client that crashes at runtime.
 *
 * Runs first in the `build` script, after `prisma generate` and before `tsc`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("../src/generated/prisma/client.ts", import.meta.url));

let source;
try {
  source = readFileSync(target, "utf8");
} catch {
  console.warn("[prisma-dirname] generated client not found; skipping (run `npx prisma generate` first).");
  process.exit(0);
}

// Rename the throwaway global key. `__prisma_dirname` does not contain the
// substring `__dirname`, so the residual check below cannot false-positive.
const replaced = source.replaceAll("'__dirname'", "'__prisma_dirname'");

if (replaced.includes("__dirname")) {
  console.error(
    "[prisma-dirname] FAILED: the generated Prisma client still contains a `__dirname` reference after " +
      "neutralization — the generated code has likely changed. Update scripts/neutralize-prisma-dirname.mjs. " +
      "Aborting the build so a client that crashes at runtime cannot be deployed.",
  );
  process.exit(1);
}

if (replaced === source) {
  console.log("[prisma-dirname] no `'__dirname'` occurrences found; nothing to do.");
} else {
  writeFileSync(target, replaced);
  console.log("[prisma-dirname] neutralized __dirname global in Prisma generated client.");
}
