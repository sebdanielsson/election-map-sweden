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
  /* Snapshot first: outputDir accumulates across archives, so counting everything in it
   * afterwards reports a running total rather than what this archive contributed. */
  const before = new Set(geoJsonFilesIn(outputDir));

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
  const wasEncoded = rawHeaders.some((header) => header.toLowerCase() === "content-encoding");
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

  fs.unlinkSync(zipFile);

  const extracted = geoJsonFilesIn(outputDir).filter((f) => !before.has(f));

  console.log(`Downloaded and extracted ${extracted.length} GeoJSON files from ${url}`);
  if (extracted.length === 0) {
    console.log("Files in directory:", fs.readdirSync(outputDir).join(", "));
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
