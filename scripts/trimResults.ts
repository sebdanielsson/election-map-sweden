/* Valmyndigheten's rostfordelning files carry every field the authority publishes: per-
 * candidate personal votes (listRoster, summeradePersonroster), previous-election
 * comparisons, turnout, reporting timestamps. The map reads four of them. For EU-val 2024
 * that is 146.6 MB downloaded to use ~6 MB of it, on every page load, and 2026 multiplies
 * the problem by three elections.
 *
 * This drops the unread fields while keeping the exact nesting the app already parses.
 * Field names and types are taken from Valmyndigheten's own spec for the 2026 files
 * ("Teknisk beskrivning av resultatfiler" -> slut-rostfordelning.md, 2026-04-17), not
 * inferred from the 2024 data, and the guards below refuse anything that does not match
 * rather than quietly emitting a thinner file. */

import * as fs from "node:fs";
import * as path from "node:path";

interface PartiRosterIn {
  partikod?: string | null;
  partiforkortning?: string | null;
  partibeteckning?: string | null;
  andelRoster?: number | null;
  antalRoster?: number | null;
}

interface OvrigaPartierIn {
  antalRoster?: number | null;
  andelRoster?: number | null;
}

interface ValdistriktIn {
  valdistriktskod?: string;
  valdistriktstyp?: string;
  rostfordelning?: {
    rosterPaverkaMandat?: { partiRoster?: PartiRosterIn[]; rosterOvrigaPartier?: OvrigaPartierIn };
  };
}

interface RostfordelningIn {
  valtillfalle?: string;
  valtyp?: string;
  valdatum?: string;
  rakningstillfalle?: string;
  senasteUppdateringstid?: string;
  antalValdistriktRaknade?: number;
  antalValdistriktSomSkaRaknas?: number;
  /* Only present in test files: "Om true innehåller filen testdata, annars saknas denna",
   * and the real 2024 and 2022 files carry no such key. Presence is therefore the signal —
   * checking the value would let `"test": "true"` through. */
  test?: unknown;
  valdistrikt?: ValdistriktIn[];
}

const [, , inputFile, outputFile] = process.argv;

if (!inputFile || !outputFile) {
  console.error("Usage: trimResults.ts <input.json> <output.json>");
  process.exit(1);
}

const fail: (message: string) => never = (message) => {
  console.error(`${path.basename(inputFile)}: ${message}`);
  process.exit(1);
};

const source = JSON.parse(fs.readFileSync(inputFile, "utf8")) as RostfordelningIn;

if ("test" in source) {
  fail(
    `carries a \`test\` field (${JSON.stringify(source.test)}) — ` +
      `production files have none, refusing to publish it`,
  );
}

const districts = source.valdistrikt;
if (!districts || districts.length === 0) {
  fail('no "valdistrikt" array — is this a rostfordelning file?');
}

/* A district with no partiRoster is not necessarily wrong (an uncounted district reports
 * an empty array), but silently shipping a file that is mostly empty is. Counting them
 * here means the operator sees it rather than discovering it on the map. */
let withoutParties = 0;
let collectionDistricts = 0;

/* Party names are a property of the party, not of each district. Repeating partibeteckning
 * on all 6589 districts cost 4 MB; collected once here it costs a few kB, and it gives the
 * app somewhere to look when partiforkortning is blank — the 2026 register has entries
 * whose abbreviation is a single space. */
const partier = new Map<
  string,
  { partiforkortning: string | null; partibeteckning: string | null }
>();

const trimmed = {
  /* Provenance travels with the data: `rakningstillfalle` distinguishes a preliminary count
   * from the final one, and the counted/total pair says how complete it is. Without these
   * the app cannot tell the user whether it is showing election-night figures. */
  valtillfalle: source.valtillfalle,
  valtyp: source.valtyp,
  valdatum: source.valdatum,
  rakningstillfalle: source.rakningstillfalle,
  senasteUppdateringstid: source.senasteUppdateringstid,
  antalValdistriktRaknade: source.antalValdistriktRaknade,
  antalValdistriktSomSkaRaknas: source.antalValdistriktSomSkaRaknas,
  /* Filled from the districts below; see the Map declaration above. */
  partier: {} as Record<
    string,
    { partiforkortning: string | null; partibeteckning: string | null }
  >,
  valdistrikt: districts.map((district) => {
    const paverkaMandat = district.rostfordelning?.rosterPaverkaMandat;
    const parties = paverkaMandat?.partiRoster ?? [];
    if (parties.length === 0) withoutParties += 1;
    for (const party of parties) {
      if (!party.partikod) continue;
      /* Best-wins rather than first-wins. The per-row partibeteckning is dropped below, so
       * if the first district that happens to mention a party carries a blank name, a
       * first-wins map would store the blank and the app would fall back to rendering the
       * bare party code — defeating the reason this lookup exists. */
      const existing = partier.get(party.partikod);
      const candidate = {
        partiforkortning: party.partiforkortning ?? null,
        partibeteckning: party.partibeteckning ?? null,
      };
      if (!existing || (!existing.partibeteckning?.trim() && candidate.partibeteckning?.trim())) {
        partier.set(party.partikod, candidate);
      }
    }
    if (district.valdistriktstyp === "uppsamlingsdistrikt") collectionDistricts += 1;

    return {
      /* Strings only. A numeric code passes a truthiness check but can never match the
       * geometry's string key, and it cannot be stringified safely either — 42% of real
       * codes begin with a zero. Left undefined here, the guard below rejects the file. */
      valdistriktskod:
        typeof district.valdistriktskod === "string" && district.valdistriktskod !== ""
          ? district.valdistriktskod
          : undefined,
      rostfordelning: {
        rosterPaverkaMandat: {
          partiRoster: parties.map((party) => ({
            partikod: party.partikod ?? null,
            partiforkortning: party.partiforkortning ?? null,
            andelRoster: party.andelRoster ?? null,
          })),
          /* Votes for parties below the reporting threshold are their own bucket, not part
           * of partiRoster. Dropping it would make any "other parties" total computed from
           * partiRoster alone understate the real figure. */
          rosterOvrigaPartier: {
            antalRoster: paverkaMandat?.rosterOvrigaPartier?.antalRoster ?? null,
            andelRoster: paverkaMandat?.rosterOvrigaPartier?.andelRoster ?? null,
          },
        },
      },
    };
  }),
};

trimmed.partier = Object.fromEntries(partier);

const missingCode = trimmed.valdistrikt.filter((d) => !d.valdistriktskod).length;
if (missingCode > 0) {
  fail(`${String(missingCode)} districts have no valdistriktskod — refusing to publish`);
}

const outputDir = path.dirname(outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
fs.writeFileSync(outputFile, JSON.stringify(trimmed));

const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
const before = fs.statSync(inputFile).size;
const after = fs.statSync(outputFile).size;
console.log(
  [
    `${path.basename(inputFile)}: ${mb(before)} MB -> ${mb(after)} MB ` +
      `(${String(Math.round((1 - after / before) * 100))}% smaller)`,
    `  valtyp=${source.valtyp ?? "?"} rakning=${source.rakningstillfalle ?? "?"} ` +
      `valdatum=${source.valdatum ?? "?"}`,
    `  parties=${String(partier.size)}, districts=${String(districts.length)} (uppsamlingsdistrikt=${String(collectionDistricts)}), ` +
      `counted=${String(source.antalValdistriktRaknade ?? "?")}/${String(
        source.antalValdistriktSomSkaRaknas ?? "?",
      )}, without parties=${String(withoutParties)}`,
  ].join("\n"),
);
