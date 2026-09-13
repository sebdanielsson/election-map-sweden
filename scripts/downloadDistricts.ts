import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import * as unzipper from "unzipper";
import { pipeline } from "node:stream/promises";
import { unsafeArchiveEntries } from "./archiveSafety.ts";
import { commitDir, recoverInterrupted, stagingPathFor } from "./publishDir.ts";
import { electionIds, getElection } from "./elections.ts";

// Usage: downloadDistricts.ts <election-id> <output-dir>
const [, , electionId, outputDir] = process.argv;

if (!outputDir) {
  console.error(
    `Usage: downloadDistricts.ts <election-id> <output-dir>\n` +
      `Known election ids: ${electionIds().join(", ")}`,
  );
  process.exit(1);
}

const election = getElection(electionId);
const districtsUrls = election.districtUrls;

/* Archives land here first and the directory is swapped in only once every one has
 * succeeded. Downloading straight into outputDir left whatever was already there: if
 * val.se reissues a county under a different basename — which it has done, every 2024 id
 * changed at some point — the old file stays, transformGeojson reads it alongside the new
 * ones, and the count check passes because there are now *more* files than expected. A
 * mixed-vintage map, every check green. */
/* Before staging, and before any failure path can return: on success commitDir would repair
 * an interrupted earlier swap itself, but a run that fails partway never reaches it, and the
 * catch below only has "leave outputDir alone" to offer — which restores nothing when the
 * interruption is why outputDir is missing. Without this a failed retry left the last good
 * set stranded under `.previous` and the target absent. */
recoverInterrupted(outputDir);

const stagingDir = stagingPathFor(outputDir);

fs.rmSync(stagingDir, { recursive: true, force: true });
fs.mkdirSync(stagingDir, { recursive: true });

/* 2024's archives contain .json, 2026's contain .geojson. Matching only one silently
 * reports "0 files extracted" for the other, so accept both. */
const geoJsonFilesIn = (dir: string) =>
  fs.readdirSync(dir).filter((f) => f.endsWith(".json") || f.endsWith(".geojson"));

const downloadAndExtract = async (url: string) => {
  const zipFile = path.join(stagingDir, path.basename(url));

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });

  /* pipeline(), not pipe() plus writer events. A body cut mid-transfer errors the *response*
   * stream, which unpipes without ending the writer: `finish` never fires, `error` never
   * fires on the writer, and the promise never settles. The await then hangs, the loop below
   * never advances, node drains the event loop and exits 0 — eleven counties on disk out of
   * twenty-one, no error, green run. pipeline() observes both ends. */
  await pipeline(response.data as NodeJS.ReadableStream, fs.createWriteStream(zipFile));

  /* A truncated body that still ends cleanly would slip past pipeline(), so check the size
   * we were promised against the size we got.
   *
   * Only when the body was not compressed in transit. axios decompresses transparently and
   * deletes `content-encoding` from the parsed headers while leaving `content-length`
   * describing the *compressed* bytes, so comparing the two would reject a perfectly good
   * download. rawHeaders still carries the original, so use that to detect the case. */
  const rawHeaders: string[] = response.request?.res?.rawHeaders ?? [];
  /* rawHeaders is a flat [name, value, name, value, ...] list, so only even indices are
   * names. Scanning it whole matches a header whose *value* happens to be the string —
   * `Vary: Content-Encoding`, which CDNs send constantly — and that silently turns the
   * size check off for that county. */
  const wasEncoded = rawHeaders.some(
    (header, index) => index % 2 === 0 && header.toLowerCase() === "content-encoding",
  );
  const expected = Number(response.headers["content-length"]);
  const written = fs.statSync(zipFile).size;
  if (!wasEncoded && Number.isFinite(expected) && expected > 0 && written !== expected) {
    throw new Error(
      `size mismatch: Content-Length promised ${String(expected)} bytes, wrote ${String(written)}`,
    );
  }

  /* Inspected before a single byte is written. This used to run after extraction, which
   * meant a hostile or merely misshapen entry had already landed somewhere by the time
   * anything looked at it. fetchResults does the same check; they share the helper. */
  const directory = await unzipper.Open.file(zipFile);
  const unsafe = unsafeArchiveEntries(directory.files);
  if (unsafe.length > 0) {
    throw new Error(`archive has unsafe entries: ${unsafe.slice(0, 5).join(", ")}`);
  }

  await fs
    .createReadStream(zipFile)
    .pipe(unzipper.Extract({ path: stagingDir }))
    .promise();

  const extracted = directory.files
    .map((entry) => entry.path)
    /* Top level only. transformGeojson reads the directory with readdirSync, which does not
     * recurse, so an archive whose GeoJSON sits in a subdirectory would satisfy a
     * "something was extracted" check and then transform nothing. */
    .filter((name) => !name.includes("/") && (name.endsWith(".json") || name.endsWith(".geojson")));

  fs.unlinkSync(zipFile);

  console.log(`Downloaded and extracted ${extracted.length} GeoJSON files from ${url}`);
  /* Throw rather than log. An archive that extracts nothing — a layout change, entries
   * nested in a subdirectory — otherwise left twenty counties transforming happily and the
   * run green, with one county simply absent from the map. transformGeojson only objects
   * when *no* files exist at all, so nothing downstream would have noticed either. */
  /* Exactly one, not "at least one". Every configured archive is a single county, and all
   * of them extract into one shared staging directory — so an archive carrying two GeoJSONs
   * can pad the total enough to hide a basename collision that silently overwrote another
   * county's file, leaving the aggregate count right and a county's data wrong. With this,
   * 21 archives must produce 21 writes, and any collision shows up as a short count. */
  if (extracted.length !== 1) {
    throw new Error(
      `archive contains ${String(extracted.length)} top-level GeoJSON files, expected exactly 1; ` +
        `entries: ${directory.files
          .map((e) => e.path)
          .slice(0, 10)
          .join(", ")}`,
    );
  }
};

/* Keep going after a failed archive so one bad URL doesn't cost the other twenty, but
 * remember what failed: a CLI that logs an error and still exits 0 is invisible to
 * whatever called it. */
const downloadAllDistricts = async () => {
  console.log(`Downloading ${districtsUrls.length} district archives for ${election.label}`);
  const failed: string[] = [];
  for (const url of districtsUrls) {
    try {
      await downloadAndExtract(url);
    } catch (error) {
      console.error(`Failed to download or extract ${url}:`, error);
      failed.push(url);
    }
  }
  /* Exactly one file per archive — not "at least", which a leftover from a previous run
   * would also satisfy. The staging directory starts empty, so this is an exact count. */
  const produced = geoJsonFilesIn(stagingDir).length;
  if (failed.length === 0 && produced !== districtsUrls.length) {
    throw new Error(
      `expected ${districtsUrls.length} district files, found ${produced} in ${stagingDir}`,
    );
  }
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${districtsUrls.length} archives failed:\n  ${failed.join("\n  ")}`,
    );
  }
};

downloadAllDistricts()
  .then(() => {
    // Swap in only once every archive has succeeded.
    commitDir(stagingDir, outputDir);
    console.log(
      `\nWrote ${String(geoJsonFilesIn(outputDir).length)} district files to ${outputDir}`,
    );
  })
  .catch((error: unknown) => {
    console.error(error);
    /* Leave whatever was in outputDir alone — a failed run must not destroy a good set. */
    fs.rmSync(stagingDir, { recursive: true, force: true });
    process.exitCode = 1;
  });
