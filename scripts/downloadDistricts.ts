import * as fs from "node:fs";
import * as path from "node:path";
import axios from "axios";
import * as unzipper from "unzipper";
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

  const writer = fs.createWriteStream(zipFile);

  response.data.pipe(writer);

  await new Promise<void>((resolve, reject) => {
    writer.on("finish", () => resolve());
    writer.on("error", (err) => reject(err));
  });

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
