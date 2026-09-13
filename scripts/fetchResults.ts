/* Pulls result files from Valmyndigheten and proves they are authentic and untampered.
 * The verified files are written out unchanged — trimming is a separate step
 * (scripts/trimResults.ts), which the workflow runs afterwards.
 *
 * Everything here fails closed. A file that cannot be verified is not published, because
 * publishing wrong election results is worse than publishing none: on election night the
 * authority overwrites these files repeatedly, and a preliminary or test file presented as
 * settled results is the failure mode that matters.
 *
 * The chain, in order, all of it mandatory:
 *   1. index.md5 lists every archive with its MD5. We only fetch what it names.
 *   2. The downloaded archive must match that MD5.
 *   3. Every JSON in the archive carries a detached RSA signature (<name>_sign.sha256,
 *      256 bytes, sha256WithRSAEncryption) which must verify against Valmyndigheten's
 *      signing certificate.
 *   4. A file carrying a `test` field at all is refused. The spec says the field is only
 *      present in test data ("annars saknas denna"), and production files confirm it —
 *      the 2024 and 2022 files have no such key — so presence is the signal, not the
 *      value. Checking `=== true` would let `"test": "true"` or `"test": 1` through.
 */

import { execFileSync } from "node:child_process";
import * as unzipper from "unzipper";
import { unsafeArchiveEntries } from "./archiveSafety.ts";
import { commitDir, recoverInterrupted, stagingPathFor } from "./publishDir.ts";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const INDEX_URL =
  process.env.VAL_INDEX_URL ?? "https://resultat.val.se/resultatfiler/val2026/index.md5";
const CERT_URL = process.env.VAL_CERT_URL ?? "https://resultat.val.se/keys/val-sign-crt.pem";
/* Which archives to take. Defaults to the riksdag files; widen it for region and kommun. */
/* Matches both countings. On election night only `preliminar` archives exist — the
 * `slutlig` ones do not appear until the final count days later — so a selector pinned to
 * either one finds nothing for most of the event. */
const SELECT = new RegExp(process.env.VAL_SELECT ?? "_00_RD\\.zip$");

const outputDir = process.argv[2];
if (!outputDir) {
  console.error("Usage: fetchResults.ts <output-dir>");
  process.exit(1);
}

const die = (message: string): never => {
  console.error(`FAILED: ${message}`);
  process.exit(1);
};

const get = async (url: string): Promise<Buffer> => {
  const response = await fetch(url);
  if (!response.ok) die(`${url} returned HTTP ${String(response.status)}`);
  return Buffer.from(await response.arrayBuffer());
};

/* index.md5 lines are "<md5>  <relative path>", and the path is relative to the index. */
const parseIndex = (body: string): { md5: string; href: string }[] =>
  body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith(" -"))
    .map((line) => {
      const [md5, ...rest] = line.split(/\s+/);
      const href = rest.join(" ").replace(/^\.\//, "");
      if (!md5 || !href) die(`cannot parse index line: ${line}`);
      return { md5, href };
    });

const main = async () => {
  /* Created up front, before any early return: a consumer counting files in here must be
   * able to tell "nothing published yet" (empty directory) from "the run died" (no
   * directory). `find` on a missing directory exits 1, which under `set -euo pipefail`
   * killed the workflow step on every run before the polls closed. */
  /* Recovery has to run before that mkdir, not after. `recoverInterrupted` keys off the
   * target being absent, so creating it first convinces it there is nothing to repair —
   * and the next commitDir then deletes the previous snapshot as stale. Verified: without
   * this line an interrupted run's data was stranded on the empty-index path and destroyed
   * on the publish path, which is precisely the failure the staging was added to prevent. */
  recoverInterrupted(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });

  const indexBody = (await get(INDEX_URL)).toString("utf8");
  const entries = parseIndex(indexBody);

  if (entries.length === 0) {
    /* Not an error: before polls close the index is an empty file. Exit 0 so a scheduled
     * run does not look broken while simply having nothing to do yet. */
    console.log("index lists no archives yet — nothing published. Exiting without changes.");
    return;
  }

  const wanted = entries.filter((entry) => SELECT.test(entry.href));
  console.log(
    `index lists ${String(entries.length)} archives, ${String(wanted.length)} match ${String(SELECT)}`,
  );
  if (wanted.length === 0) {
    /* Not fatal. Before our election's archives appear the index is full of other ones, and
     * dying here would fail every scheduled run for hours — indistinguishable from a real
     * verification failure, and precisely during the event this exists for. */
    console.warn(
      `::warning::index has ${String(entries.length)} archives but none match ${String(SELECT)} — nothing to do`,
    );
    return;
  }

  const cert = await get(CERT_URL);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "valresultat-"));
  const stagingDir = path.join(workDir, "staging");
  /* Separate from workDir: the public key used to verify signatures must not sit anywhere
   * an extracted archive could reach, whatever unzip does with a hostile entry name. */
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "valkeys-"));
  /* Registered, not deferred to the end of main(). Every verification failure goes through
   * die(), which is process.exit(), so a try/finally would be skipped — and on election
   * night this polls every five minutes, so each rejected poll used to leave an archive
   * tree and a key directory behind in /tmp. An exit handler runs on the die() paths, the
   * success path and an uncaught throw alike. */
  process.on("exit", () => {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(keyDir, { recursive: true, force: true });
  });
  fs.mkdirSync(stagingDir, { recursive: true });
  const certPath = path.join(keyDir, "val-sign-crt.pem");
  fs.writeFileSync(certPath, cert);
  /* Not a root of trust — the certificate comes from the same host as the data, so this
   * proves integrity and provenance-as-served, not that Valmyndigheten signed it. It still
   * catches a certificate outside its validity window, which openssl does not check during
   * `dgst -verify`. Pinning the SPKI hash would be the stronger control. */
  /* Parsed first, expiry second. One combined check reported every failure as an expiry,
   * so a 503 page or a redirect from the CDN — which openssl rejects with "Could not read
   * certificate" — sent whoever was on call looking for a renewal that was not the problem.
   * Both still fail closed; only the diagnosis differs, and on election night that is the
   * difference between a two-minute fix and a wrong search. */
  try {
    execFileSync("openssl", ["x509", "-in", certPath, "-noout"], { stdio: "pipe" });
  } catch {
    die(`${CERT_URL} did not return a readable X.509 certificate`);
  }
  try {
    execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-checkend", "0"], {
      stdio: "pipe",
    });
  } catch {
    die("Valmyndigheten's signing certificate has expired");
  }
  /* -checkend only tests notAfter, so notBefore is checked separately: a certificate that
   * is not valid yet would otherwise verify signatures happily. */
  const notBefore = execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-startdate"])
    .toString()
    .replace("notBefore=", "")
    .trim();
  if (Number.isNaN(Date.parse(notBefore))) {
    die(`could not read the certificate's notBefore date ("${notBefore}")`);
  }
  if (Date.parse(notBefore) > Date.now()) {
    die(`Valmyndigheten's signing certificate is not valid until ${notBefore}`);
  }
  const publicKey = execFileSync("openssl", ["x509", "-pubkey", "-noout", "-in", certPath]);
  const publicKeyPath = path.join(keyDir, "pub.pem");
  fs.writeFileSync(publicKeyPath, publicKey);
  console.log(
    `signing certificate: ${execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-subject"]).toString().trim()}`,
  );

  const base = INDEX_URL.replace(/index\.md5$/, "");

  for (const { md5, href } of wanted) {
    const archive = await get(`${base}${href}`);

    const actual = crypto.createHash("md5").update(archive).digest("hex");
    if (actual !== md5) die(`${href}: MD5 mismatch — index says ${md5}, download is ${actual}`);

    const unpacked = path.join(workDir, path.basename(href, ".zip"));
    fs.mkdirSync(unpacked, { recursive: true });
    const zipPath = path.join(workDir, path.basename(href));
    fs.writeFileSync(zipPath, archive);
    /* Check the central directory before extracting. Info-ZIP's unzip does strip leading
     * `../` (verified: an entry named ../pub.pem lands inside the target, not beside it),
     * but that is unzip's behaviour rather than a guarantee of ours, and the archive comes
     * from the same host as everything else here — so nothing is independently trusted at
     * this point. The shared helper rejects anything that is not a plain top-level name,
     * and any symlink entry — a case the earlier inline check here did not cover. */
    const listing = await unzipper.Open.file(zipPath);
    const unsafe = unsafeArchiveEntries(listing.files);
    if (unsafe.length > 0) {
      die(`${href}: archive has unsafe entries: ${unsafe.slice(0, 5).join(", ")}`);
    }
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", unpacked]);

    const jsonFiles = fs.readdirSync(unpacked).filter((f) => f.toLowerCase().endsWith(".json"));
    if (jsonFiles.length === 0) {
      die(`${href}: archive contains no JSON at its top level — refusing to report success`);
    }

    for (const name of jsonFiles) {
      const jsonPath = path.join(unpacked, name);
      const signaturePath = path.join(unpacked, `${name.replace(/\.json$/, "")}_sign.sha256`);

      if (!fs.existsSync(signaturePath)) {
        die(`${name}: no detached signature alongside it — refusing to publish unverified data`);
      }
      try {
        execFileSync(
          "openssl",
          ["dgst", "-sha256", "-verify", publicKeyPath, "-signature", signaturePath, jsonPath],
          { stdio: "pipe" },
        );
      } catch {
        die(`${name}: signature does NOT verify against Valmyndigheten's certificate`);
      }

      const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as Record<string, unknown>;
      if ("test" in parsed) {
        die(
          `${name}: carries a \`test\` field (${JSON.stringify(parsed.test)}) — ` +
            `production files have none, refusing to publish it`,
        );
      }

      /* Staged, not written straight to outputDir: a failure on a later archive used to
       * leave earlier files behind, so a direct caller could mistake a partial set for a
       * verified one. Everything moves across together once the whole loop succeeds. */
      fs.copyFileSync(jsonPath, path.join(stagingDir, name));
      console.log(`  verified ${name}`);
    }
  }

  /* Swapped in as a directory rather than copied file by file: copying left any JSON from a
   * previous run sitting beside the new snapshot, and an interruption mid-loop produced
   * exactly the partial output the staging was meant to prevent. The staging directory is
   * built next to the target so the rename stays on one filesystem. */
  const finalStaging = stagingPathFor(outputDir);
  fs.rmSync(finalStaging, { recursive: true, force: true });
  fs.mkdirSync(finalStaging, { recursive: true });
  for (const name of fs.readdirSync(stagingDir)) {
    fs.copyFileSync(path.join(stagingDir, name), path.join(finalStaging, name));
  }
  commitDir(finalStaging, outputDir);
  console.log(`\nVerified files written to ${outputDir}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
