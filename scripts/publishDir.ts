/* Building a directory off to one side and swapping it in, without the two ways of getting
 * that wrong that review found in the first attempt.
 *
 * 1. The staging path was derived by string concatenation, so a perfectly ordinary
 *    `public/data/districts/` — with the trailing slash a shell tab-completes for you —
 *    produced `public/data/districts/.staging-123`, i.e. *inside* the directory about to be
 *    removed. Verified: the transform crashed and wrote nothing.
 * 2. The swap removed the existing directory before installing the new one, so an
 *    interruption in between left no data at all — the opposite of the guarantee it was
 *    written to provide. */

import * as fs from "node:fs";
import * as path from "node:path";

/** A sibling of the target, never a child of it, whatever trailing separators the caller passed. */
export const stagingPathFor = (targetDir: string): string =>
  `${path.resolve(targetDir)}.staging-${String(process.pid)}`;

/**
 * Installs `stagingDir` as `targetDir`. The previous contents are moved aside first and
 * only deleted once the new set is in place, so a failure rolls back to exactly what was
 * there before rather than to nothing.
 */
export const commitDir = (stagingDir: string, targetDir: string): void => {
  const target = path.resolve(targetDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const previous = `${target}.previous-${String(process.pid)}`;
  const hadPrevious = fs.existsSync(target);
  if (hadPrevious) fs.renameSync(target, previous);

  try {
    fs.renameSync(stagingDir, target);
  } catch (error) {
    /* Put back what was there. Without this, a rename that fails — a cross-device staging
     * path, a permissions change — would leave the caller with nothing at all. */
    if (hadPrevious) fs.renameSync(previous, target);
    throw error;
  }

  if (hadPrevious) fs.rmSync(previous, { recursive: true, force: true });
};
