/* Pulls result files from Valmyndigheten, proves they are authentic and untampered, and
 * writes trimmed copies ready to upload.
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
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const INDEX_URL =
  process.env.VAL_INDEX_URL ?? "https://resultat.val.se/resultatfiler/val2026/index.md5";
const CERT_URL = process.env.VAL_CERT_URL ?? "https://resultat.val.se/keys/val-sign-crt.pem";
/* Which archives to take. Defaults to the riksdag files; widen it for region and kommun. */
const SELECT = new RegExp(process.env.VAL_SELECT ?? "_RD\\.zip$");

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
  if (wanted.length === 0)
    die(`index has ${String(entries.length)} archives but none match ${String(SELECT)}`);

  const cert = await get(CERT_URL);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "valresultat-"));
  const certPath = path.join(workDir, "val-sign-crt.pem");
  fs.writeFileSync(certPath, cert);
  /* Not a root of trust — the certificate comes from the same host as the data, so this
   * proves integrity and provenance-as-served, not that Valmyndigheten signed it. It still
   * catches an expired or not-yet-valid certificate, which openssl does not check on its
   * own during `dgst -verify`. Pinning the SPKI hash would be the stronger control. */
  try {
    execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-checkend", "0"], {
      stdio: "pipe",
    });
  } catch {
    die("Valmyndigheten's signing certificate is expired or not yet valid");
  }
  const publicKey = execFileSync("openssl", ["x509", "-pubkey", "-noout", "-in", certPath]);
  const publicKeyPath = path.join(workDir, "pub.pem");
  fs.writeFileSync(publicKeyPath, publicKey);
  console.log(
    `signing certificate: ${execFileSync("openssl", ["x509", "-in", certPath, "-noout", "-subject"]).toString().trim()}`,
  );

  fs.mkdirSync(outputDir, { recursive: true });
  const base = INDEX_URL.replace(/index\.md5$/, "");

  for (const { md5, href } of wanted) {
    const archive = await get(`${base}${href}`);

    const actual = crypto.createHash("md5").update(archive).digest("hex");
    if (actual !== md5) die(`${href}: MD5 mismatch — index says ${md5}, download is ${actual}`);

    const unpacked = path.join(workDir, path.basename(href, ".zip"));
    fs.mkdirSync(unpacked, { recursive: true });
    const zipPath = path.join(workDir, path.basename(href));
    fs.writeFileSync(zipPath, archive);
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

      fs.copyFileSync(jsonPath, path.join(outputDir, name));
      console.log(`  verified ${name}`);
    }
  }

  fs.rmSync(workDir, { recursive: true, force: true });
  console.log(`\nVerified files written to ${outputDir}`);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
