/* Refuses a result file that cannot be paired, for the half that nothing else validates.
 *
 * rostfordelning goes through trimResults, which checks this on the way past. mandatfordelning
 * is copied to the bucket untouched, so until this existed half of the contract src/App.tsx
 * enforces at load time was never checked at publication at all — a mandatfordelning with a
 * missing or null counter would upload cleanly and then make the app reject the pair, showing
 * a generic load error instead of leaving the previous good snapshot on screen.
 *
 * Usage: checkProvenance.ts <file.json> [...]  — exits non-zero naming every problem found. */

import fs from "node:fs";
import path from "node:path";
import { provenanceProblems, type ResultProvenance } from "./provenance.ts";

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error("Usage: checkProvenance.ts <file.json> [...]");
  process.exit(1);
}

let failed = false;

for (const file of files) {
  const name = path.basename(file);
  let source: ResultProvenance;
  try {
    source = JSON.parse(fs.readFileSync(file, "utf8")) as ResultProvenance;
  } catch (err) {
    console.error(
      `${name}: not readable as JSON — ${err instanceof Error ? err.message : String(err)}`,
    );
    failed = true;
    continue;
  }
  const problems = provenanceProblems(source);
  if (problems.length > 0) {
    console.error(
      `${name}: provenance unusable: ${problems.join("; ")} — refusing to publish a file the app cannot pair`,
    );
    failed = true;
    continue;
  }
  console.log(`${name}: provenance ok`);
}

if (failed) process.exit(1);
