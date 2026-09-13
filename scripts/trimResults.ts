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

/* The input interfaces are casts over parsed JSON, so they promise nothing at runtime. These
 * two numbers reach the app unguarded: it filters and compares them (`andelRoster >= cutoff`),
 * sums them (`sum + andelRoster`) and formats them (`andelRoster?.toFixed(2)`). A string
 * survives the comparison, turns the sum into concatenation, and then throws on `.toFixed` —
 * a district click that crashes the sidebar. Everything else here fails closed on schema
 * drift; these did not.
 *
 * null is allowed: the app tests `andelRoster !== null` explicitly, and an uncounted district
 * legitimately has no share yet. Only a non-null, non-finite value is refused, which covers
 * strings, NaN and Infinity. Checked against the real 2022 riksdag file first — 52,624 party
 * rows and 6,578 other-party buckets, every value a number — so this rejects no good data. */
const numberOrNull = (value: unknown, where: string): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(
      `${where} is ${typeof value === "number" ? String(value) : typeof value}, expected a finite number or null`,
    );
  }
  return value;
};

/* An absent *container* and an absent *member of a present container* are different facts.
 * numberOrNull maps undefined to null, which is right for a bucket that simply is not there
 * and wrong for one that is: `rosterOvrigaPartier: {}` would publish as a null share, and
 * App.tsx turns a null other-party share into 0 — quietly understating Others rather than
 * failing. So presence is checked where the container exists. */
const requiredNumberMember = (container: object, key: string, where: string): number | null => {
  if (!Object.hasOwn(container, key)) {
    fail(`${where} is absent from a bucket that is present — refusing to publish it as null`);
  }
  return numberOrNull((container as Record<string, unknown>)[key], where);
};

/* The labels get the same treatment as the numbers, for the same reason: they are only cast,
 * not checked. App.tsx renders a party with `partiforkortning?.trim()`, so a row carrying a
 * number there throws while the sidebar is rendering — a district click that breaks the page.
 * Verified against the real 2022 riksdag file: all 52,624 rows carry a string. */
const stringOrNull = (value: unknown, where: string): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    fail(`${where} is ${typeof value}, expected a string or null`);
  }
  return value;
};

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

/* Provenance is the answer to "which snapshot is this", and JSON.stringify drops an
 * undefined value entirely — so an upstream file that stopped carrying one of these would
 * publish a file missing a field `Rostfordelning` declares as always present, with nothing
 * failing anywhere. The district checks below already fail closed on schema drift; these
 * fields deserve the same treatment, because a preliminary count presented as a final one
 * is the failure that matters on election night.
 *
 * An explicit null passes: the app's type allows it and it survives serialisation. Only an
 * absent key or a wrong type is refused. Verified present and correctly typed in every real
 * rostfordelning checked — 2022 riksdag and 2024 EU — so this does not reject good input. */
const requiredProvenance: [keyof RostfordelningIn, "string" | "number"][] = [
  ["valtillfalle", "string"],
  ["valtyp", "string"],
  ["rakningstillfalle", "string"],
  ["senasteUppdateringstid", "string"],
  ["antalValdistriktRaknade", "number"],
  ["antalValdistriktSomSkaRaknas", "number"],
];
const provenanceProblems = requiredProvenance.flatMap(([key, kind]) => {
  if (!Object.hasOwn(source, key)) return [`${key} is absent`];
  const value = source[key];
  if (value === null) return [];
  if (typeof value !== kind) return [`${key} is ${typeof value}, expected ${kind} or null`];
  return [];
});
if (provenanceProblems.length > 0) {
  fail(
    `provenance unusable: ${provenanceProblems.join("; ")} — refusing to publish a snapshot ` +
      `that cannot be identified as preliminary or final`,
  );
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
    const ovriga = paverkaMandat?.rosterOvrigaPartier;
    if (
      ovriga !== undefined &&
      ovriga !== null &&
      (typeof ovriga !== "object" || Array.isArray(ovriga))
    ) {
      fail(
        `district ${district.valdistriktskod ?? "(no code)"} has a rosterOvrigaPartier that is ` +
          `${Array.isArray(ovriga) ? "an array" : typeof ovriga}, not an object — refusing to ` +
          `publish it as if no one voted for a small party`,
      );
    }
    /* An uncounted district legitimately reports an empty partiRoster, so an empty array is
     * fine. A *missing* one is not: `?? []` would turn a schema change, or the wrong file
     * being selected, into an apparently valid snapshot in which every district has no
     * parties at all — published without complaint. */
    if (!Array.isArray(paverkaMandat?.partiRoster)) {
      fail(
        `district ${district.valdistriktskod ?? "(no code)"} has no partiRoster array — ` +
          `refusing to publish a result file with no results`,
      );
    }
    const parties = paverkaMandat.partiRoster;
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
        typeof district.valdistriktskod === "string" &&
        district.valdistriktskod !== "" &&
        !/\s/.test(district.valdistriktskod)
          ? district.valdistriktskod
          : undefined,
      rostfordelning: {
        rosterPaverkaMandat: {
          partiRoster: parties.map((party) => ({
            partikod: stringOrNull(
              party.partikod,
              `district ${district.valdistriktskod ?? "(no code)"} partikod`,
            ),
            partiforkortning: stringOrNull(
              party.partiforkortning,
              `district ${district.valdistriktskod ?? "(no code)"} party ${party.partikod ?? "(no code)"} partiforkortning`,
            ),
            andelRoster: requiredNumberMember(
              party,
              "andelRoster",
              `district ${district.valdistriktskod ?? "(no code)"} party ${party.partikod ?? "(no code)"} andelRoster`,
            ),
          })),
          /* Votes for parties below the reporting threshold are their own bucket, not part
           * of partiRoster. Dropping it would make any "other parties" total computed from
           * partiRoster alone understate the real figure. */
          /* Checked for shape before it is read. Optional chaining turns a malformed bucket —
           * a string, an array — into two undefined reads, which numberOrNull then reports as
           * null, publishing the district as if nobody voted for a small party. Absent stays
           * legal (the type allows partial files); present-but-not-an-object does not. */
          rosterOvrigaPartier: {
            antalRoster:
              ovriga == null
                ? null
                : requiredNumberMember(
                    ovriga,
                    "antalRoster",
                    `district ${district.valdistriktskod ?? "(no code)"} rosterOvrigaPartier.antalRoster`,
                  ),
            andelRoster:
              ovriga == null
                ? null
                : requiredNumberMember(
                    ovriga,
                    "andelRoster",
                    `district ${district.valdistriktskod ?? "(no code)"} rosterOvrigaPartier.andelRoster`,
                  ),
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

/* The app looks districts up with .find(), so a duplicate code means the second district's
 * votes are silently never shown. Real files have none — 6589 codes, 6589 unique — which is
 * precisely why a duplicate appearing would be a sign something is wrong upstream. */
/* One pass with a Set rather than indexOf per element: the scan-per-district version was
 * ~56 ms on the real 6589 districts against ~1 ms for this, and it is the same answer. */
/* `string | undefined`, not `string`: that is what the field is declared as, and the
 * missing-code guard above is what rules undefined out — not something the type system
 * knows here. Narrowing would mean asserting, which is the one thing this check exists
 * to avoid doing about district codes. */
const seenCodes = new Set<string | undefined>();
const duplicateCodes = new Set<string | undefined>();
for (const district of trimmed.valdistrikt) {
  const code = district.valdistriktskod;
  if (seenCodes.has(code)) duplicateCodes.add(code);
  else seenCodes.add(code);
}
const duplicates = [...duplicateCodes];
if (duplicates.length > 0) {
  fail(
    `duplicate valdistriktskod: ${duplicates.slice(0, 5).join(", ")} — ` +
      `the app resolves districts by code and would silently ignore the later one`,
  );
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
