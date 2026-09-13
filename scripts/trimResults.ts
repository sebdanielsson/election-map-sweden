/* Valmyndigheten's rostfordelning files carry every field the authority publishes: per-
 * candidate personal votes (listRoster), previous-election comparisons, turnout, reporting
 * timestamps. The map reads four of them. For EU-val 2024 that is 146.6 MB downloaded to
 * use 5.9 MB of it, on every page load, and 2026 multiplies the problem by three elections.
 *
 * This drops the unread fields while keeping the exact nesting the app already parses, so
 * electionDataInterfaces.ts and App.tsx are unchanged. Run it over the files unpacked from
 * val.se before uploading them. */

import * as fs from "node:fs";
import * as path from "node:path";

interface PartiRosterIn {
  partikod: string | null;
  partiforkortning: string | null;
  andelRoster: number | null;
}

interface ValdistriktIn {
  valdistriktskod: string;
  rostfordelning?: { rosterPaverkaMandat?: { partiRoster?: PartiRosterIn[] } };
}

interface RostfordelningIn {
  valdistrikt?: ValdistriktIn[];
}

const [, , inputFile, outputFile] = process.argv;

if (!inputFile || !outputFile) {
  console.error("Usage: trimResults.ts <input.json> <output.json>");
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(inputFile, "utf8")) as RostfordelningIn;
const districts = source.valdistrikt;

if (!districts || districts.length === 0) {
  console.error(`No "valdistrikt" array in ${inputFile} — is this a rostfordelning file?`);
  process.exit(1);
}

const trimmed = {
  valdistrikt: districts.map((district) => ({
    valdistriktskod: district.valdistriktskod,
    rostfordelning: {
      rosterPaverkaMandat: {
        partiRoster: (district.rostfordelning?.rosterPaverkaMandat?.partiRoster ?? []).map(
          (party) => ({
            partikod: party.partikod,
            partiforkortning: party.partiforkortning,
            andelRoster: party.andelRoster,
          }),
        ),
      },
    },
  })),
};

const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(outputFile, JSON.stringify(trimmed));

const before = fs.statSync(inputFile).size;
const after = fs.statSync(outputFile).size;
const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
console.log(
  `${path.basename(inputFile)}: ${mb(before)} MB -> ${mb(after)} MB ` +
    `(${String(Math.round((1 - after / before) * 100))}% smaller, ${String(districts.length)} districts)`,
);
