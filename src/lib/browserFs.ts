// Folder reading for the plain-browser fallback (npm run dev in a browser).
// Contents are held in memory as inline docs; the Tauri app never uses this.
import { displayName, isMarkdownPath } from "./platform";
import type { FileLeaf, FolderNode } from "./types";

const MAX_INLINE_FILES = 400;

interface Ctx {
  count: number;
}

function sortTree(node: FolderNode): FolderNode {
  node.dirs.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  node.files.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
  );
  node.dirs.forEach(sortTree);
  return node;
}

/* ---------- drag & drop: webkit entry API ---------- */

interface WebkitEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
  createReader?: () => {
    readEntries: (
      ok: (entries: WebkitEntry[]) => void,
      err: (e: unknown) => void,
    ) => void;
  };
  file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
}

async function readAllEntries(entry: WebkitEntry): Promise<WebkitEntry[]> {
  const reader = entry.createReader?.();
  if (!reader) return [];
  const all: WebkitEntry[] = [];
  // readEntries returns batches of ≤100; keep calling until an empty batch.
  for (;;) {
    const batch = await new Promise<WebkitEntry[]>((res, rej) =>
      reader.readEntries(res, rej),
    ).catch(() => [] as WebkitEntry[]);
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

async function walkEntry(
  entry: WebkitEntry,
  parentPath: string,
  ctx: Ctx,
): Promise<FolderNode | null> {
  const path = `${parentPath}/${entry.name}`;
  const children = await readAllEntries(entry);
  const dirs: FolderNode[] = [];
  const files: FileLeaf[] = [];
  for (const child of children) {
    if (child.name.startsWith(".")) continue;
    if (child.isDirectory) {
      const node = await walkEntry(child, path, ctx);
      if (node) dirs.push(node);
    } else if (
      child.isFile &&
      isMarkdownPath(child.name) &&
      ctx.count < MAX_INLINE_FILES &&
      child.file
    ) {
      const file = await new Promise<File>((res, rej) =>
        child.file!(res, rej),
      ).catch(() => null);
      if (!file) continue;
      ctx.count += 1;
      files.push({
        id: `${path}/${child.name}`,
        name: displayName(child.name),
        inline: await file.text(),
      });
    }
  }
  if (dirs.length === 0 && files.length === 0) return null;
  const node: FolderNode = { name: entry.name, path, dirs, files };
  return sortTree(node);
}

/** Build an in-memory tree from a dropped directory entry. */
export async function directoryEntryToTree(
  entry: unknown,
): Promise<FolderNode | null> {
  const ctx: Ctx = { count: 0 };
  return walkEntry(entry as WebkitEntry, `mem:${crypto.randomUUID()}`, ctx);
}

/* ---------- folder picker: <input webkitdirectory> ---------- */

/** Build an in-memory tree from a directory-picker FileList. */
export async function fileListToTree(files: File[]): Promise<FolderNode | null> {
  const relOf = (f: File) =>
    (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  const mdFiles = files.filter(
    (f) =>
      isMarkdownPath(f.name) &&
      !relOf(f)
        .split("/")
        .some((part) => part.startsWith(".")),
  );
  if (mdFiles.length === 0) return null;

  const rootName = relOf(mdFiles[0]).split("/")[0] || "Folder";
  const basePath = `mem:${crypto.randomUUID()}/${rootName}`;
  const root: FolderNode = { name: rootName, path: basePath, dirs: [], files: [] };

  for (const f of mdFiles.slice(0, MAX_INLINE_FILES)) {
    const parts = relOf(f).split("/"); // [root, ...dirs, filename]
    let node = root;
    let cur = basePath;
    for (const part of parts.slice(1, -1)) {
      cur += `/${part}`;
      let child = node.dirs.find((d) => d.name === part);
      if (!child) {
        child = { name: part, path: cur, dirs: [], files: [] };
        node.dirs.push(child);
      }
      node = child;
    }
    node.files.push({
      id: `${cur}/${f.name}`,
      name: displayName(f.name),
      inline: await f.text(),
    });
  }
  return sortTree(root);
}
