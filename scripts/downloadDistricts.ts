import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import * as unzipper from "unzipper";
import { pipeline } from "node:stream/promises";
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

// Check if output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

/* 2024's archives contain .json, 2026's contain .geojson. Matching only one silently
 * reports "0 files extracted" for the other, so accept both. */
const geoJsonFilesIn = (dir: string) =>
  fs.readdirSync(dir).filter((f) => f.endsWith(".json") || f.endsWith(".geojson"));

const downloadAndExtract = async (url: string) => {
  const zipFile = path.join(outputDir, path.basename(url));

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

  await fs
    .createReadStream(zipFile)
    .pipe(unzipper.Extract({ path: outputDir }))
    .promise();

  /* Ask the archive what it contains rather than diffing the directory. A directory diff
   * counts only files that were not already there, so a re-run — which legitimately
   * overwrites the same names — looked like an archive that extracted nothing. */
  const directory = await unzipper.Open.file(zipFile);
  const extracted = directory.files
    .map((entry) => entry.path)
    .filter((name) => name.endsWith(".json") || name.endsWith(".geojson"));

  fs.unlinkSync(zipFile);

  console.log(`Downloaded and extracted ${extracted.length} GeoJSON files from ${url}`);
  /* Throw rather than log. An archive that extracts nothing — a layout change, entries
   * nested in a subdirectory — otherwise left twenty counties transforming happily and the
   * run green, with one county simply absent from the map. transformGeojson only objects
   * when *no* files exist at all, so nothing downstream would have noticed either. */
  if (extracted.length === 0) {
    throw new Error(
      `archive contains no GeoJSON; entries: ${directory.files
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
  /* One file per archive, or something went missing quietly. */
  const produced = geoJsonFilesIn(outputDir).length;
  if (failed.length === 0 && produced < districtsUrls.length) {
    throw new Error(
      `expected ${districtsUrls.length} district files, found ${produced} in ${outputDir}`,
    );
  }
  if (failed.length > 0) {
    throw new Error(
      `${failed.length} of ${districtsUrls.length} archives failed:\n  ${failed.join("\n  ")}`,
    );
  }
};

downloadAllDistricts().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
