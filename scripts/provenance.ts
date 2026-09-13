/* The provenance contract, in one place because two sides depend on it.
 *
 * src/App.tsx pairs rostfordelning with mandatfordelning by comparing four fields, and refuses
 * to render a pair that cannot supply them. This module is what the publishing side checks so
 * that contract is enforced before an unusable file reaches the bucket rather than after. When
 * only the consumer checked, a bad upstream field turned into a broken map; refusing to publish
 * leaves the previous good snapshot in place and the map keeps working on slightly stale
 * figures, which is the better of the two outcomes on election night.
 *
 * Both halves go through this. mandatfordelning used to be copied to the bucket unexamined,
 * so half the contract the app enforces was never checked at all. */

/** Shape shared by both halves. Optional throughout: these are casts over parsed JSON. */
export interface ResultProvenance {
  valtillfalle?: string | null;
  valtyp?: string | null;
  rakningstillfalle?: string | null;
  senasteUppdateringstid?: string | null;
  antalUppdateringar?: number | null;
}

/* Deliberately stricter than the nullable ones below: these three plus the counter are what
 * src/App.tsx's `provenanceOf` requires, and it requires them non-null. An explicit null would
 * satisfy a laxer check here and be refused there — and two nulls compare equal, which is the
 * vacuous match the app's pairing check exists to prevent. */
const IDENTITY_FIELDS = ["valtillfalle", "valtyp", "rakningstillfalle"] as const;

/** Describes a value the way an operator reading a stopped pipeline needs it described. */
const describe = (present: boolean, value: unknown): string => {
  if (!present) return "absent";
  /* `typeof null` is "object", which is the least useful thing to print about the value most
   * likely to turn up here. */
  if (value === null) return "null";
  return typeof value;
};

/**
 * Every reason this file cannot be paired, or an empty array. Returns all of them rather than
 * the first: a run that stops publishing should say everything that is wrong in one go.
 */
export const provenanceProblems = (source: ResultProvenance): string[] => {
  const problems: string[] = [];

  for (const key of IDENTITY_FIELDS) {
    const present = Object.hasOwn(source, key);
    const value = source[key];
    if (!present || typeof value !== "string") {
      problems.push(`${key} is ${describe(present, value)}, expected a string`);
    }
  }

  /* Number.isFinite rather than typeof: a JSON literal like 1e999 parses as Infinity, passes a
   * typeof check, and is then written back out by JSON.stringify as null — so a typeof guard
   * here would publish exactly the file the app rejects, which is the opposite of failing
   * closed. NaN goes the same way. */
  if (!Number.isFinite(source.antalUppdateringar)) {
    problems.push(
      `antalUppdateringar is ${describe(
        Object.hasOwn(source, "antalUppdateringar"),
        source.antalUppdateringar,
      )}, expected a finite number`,
    );
  }

  /* Nullable, unlike the four above: the app reads it for display only and tolerates null, so
   * requiring more here would reject a file the app is perfectly happy with. Present-and-wrong
   * still fails. */
  if (!Object.hasOwn(source, "senasteUppdateringstid")) {
    problems.push("senasteUppdateringstid is absent, expected a string or null");
  } else if (
    source.senasteUppdateringstid !== null &&
    typeof source.senasteUppdateringstid !== "string"
  ) {
    problems.push(
      `senasteUppdateringstid is ${typeof source.senasteUppdateringstid}, expected a string or null`,
    );
  }

  return problems;
};
