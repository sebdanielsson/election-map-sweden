/* Checks a zip's central directory before anything is extracted.
 *
 * Neither of the attacks this guards against currently succeeds with the extractors in use
 * — Info-ZIP's `unzip` strips a leading `../`, and the `unzipper` library drops such an
 * entry outright and flattens a symlink entry into a regular file containing the link text.
 * Both were verified rather than assumed. But that is the extractor's behaviour, not a
 * property these scripts own, and every archive here is fetched from the same host that
 * serves the certificate used to verify it — so nothing is independently trusted at the
 * point of extraction. Refusing up front is cheap and does not depend on which extractor,
 * or which version of it, runs.
 *
 * It also catches something duller and likelier than an attack: an archive whose layout has
 * changed. Entries in a subdirectory extract fine and then vanish from a non-recursive
 * directory read, which previously turned into a county silently missing from the map. */

interface CentralDirectoryEntry {
  path: string;
  externalFileAttributes?: number;
}

/** Unix file-type bits live in the high 16 bits of externalFileAttributes; 0xA000 is a symlink. */
const S_IFMT = 0xf000;
const S_IFLNK = 0xa000;

const isSymlink = (entry: CentralDirectoryEntry): boolean =>
  (((entry.externalFileAttributes ?? 0) >>> 16) & S_IFMT) === S_IFLNK;

/**
 * Returns the reasons an archive should be refused, empty if it is fine. Entries must be
 * plain names at the archive's top level: no directory separators, no leading dot, no
 * drive letters, and no symlinks.
 */
export const unsafeArchiveEntries = (files: CentralDirectoryEntry[]): string[] => {
  const reasons: string[] = [];
  for (const entry of files) {
    const name = entry.path;
    /* Directory entries are the one legitimate use of a trailing slash, and unzipper lists
     * them; they carry no content, so judge them by what they would create. */
    const bare = name.endsWith("/") ? name.slice(0, -1) : name;
    if (isSymlink(entry)) {
      reasons.push(`${name} (symlink)`);
    } else if (bare.includes("/") || bare.includes("\\")) {
      reasons.push(`${name} (not at the top level)`);
    } else if (bare.startsWith(".") || /^[A-Za-z]:/.test(bare)) {
      reasons.push(`${name} (suspicious name)`);
    }
  }
  return reasons;
};
