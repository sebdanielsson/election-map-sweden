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
 * Removes `<target>.staging-<pid>` directories belonging to processes that no longer exist.
 *
 * Staging is pid-scoped, so a run killed after staging was populated left a full copy of the
 * dataset behind that nothing ever read or removed — the same shape as the 439 MB of /tmp
 * that fetchResults was leaking before its cleanup was fixed, and it lands in the workspace
 * rather than in /tmp.
 *
 * Liveness is checked with `kill(pid, 0)` rather than a timestamp, so a staging directory
 * belonging to a process that is still running is never touched. That matters because the
 * caller is about to build its own staging next to these.
 */
export const cleanStagingOrphans = (targetDir: string): string[] => {
  const target = path.resolve(targetDir);
  const parent = path.dirname(target);
  const prefix = `${path.basename(target)}.staging-`;
  if (!fs.existsSync(parent)) return [];
  const removed: string[] = [];
  for (const entry of fs.readdirSync(parent)) {
    if (!entry.startsWith(prefix)) continue;
    const pid = Number(entry.slice(prefix.length));
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      /* Signal 0 performs the permission and existence checks without delivering anything. */
      process.kill(pid, 0);
      continue; /* still alive — leave it be */
    } catch (error) {
      /* EPERM means the process exists but belongs to someone else; only ESRCH means gone. */
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
    }
    fs.rmSync(path.join(parent, entry), { recursive: true, force: true });
    removed.push(entry);
  }
  return removed;
};

/* Deliberately not pid-suffixed, unlike the staging path. Recovery depends on a *later*
 * run being able to recognise this directory, and a dead process's pid tells it nothing. */
const previousPathFor = (target: string): string => `${target}.previous`;

/**
 * Repairs the one state an interrupted commitDir can leave behind: the target gone and its
 * contents sitting under `<target>.previous`, because the process was killed between the two
 * renames. Returns true if it restored something.
 *
 * This is the window review asked about. It cannot be closed outright: rename(2) refuses to
 * replace a non-empty directory (ENOTEMPTY — verified, not assumed), so swapping one
 * directory for another is necessarily two renames, and a SIGKILL between them runs no catch
 * block. The alternative is making the target a symlink and flipping that atomically, which
 * would change what the path *is* — `find verified -maxdepth 1` stops descending into a
 * symlinked directory, which is exactly how the workflow counts verified files. So the window
 * stays, and this makes it self-healing on the next run instead.
 */
export const recoverInterrupted = (targetDir: string): boolean => {
  const target = path.resolve(targetDir);
  const previous = previousPathFor(target);
  if (fs.existsSync(target) || !fs.existsSync(previous)) return false;
  fs.renameSync(previous, target);
  return true;
};

/**
 * Installs `stagingDir` as `targetDir`. The previous contents are moved aside first and
 * only deleted once the new set is in place, so a failure rolls back to exactly what was
 * there before rather than to nothing.
 */
export const commitDir = (stagingDir: string, targetDir: string): void => {
  const target = path.resolve(targetDir);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  const previous = previousPathFor(target);
  /* Heal an interrupted earlier run before doing anything else, so its data comes back
   * rather than being deleted as if it were leftover scrap. */
  if (recoverInterrupted(target)) {
    console.warn(`recovered ${path.basename(target)} from an interrupted earlier run`);
  } else {
    /* Target present and a `.previous` beside it: an earlier run got its new set installed
     * and died before the cleanup. That copy is superseded, so it goes. */
    fs.rmSync(previous, { recursive: true, force: true });
  }

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
