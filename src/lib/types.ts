export interface DocFile {
  /** Absolute path for on-disk files; a synthetic id for inline docs. */
  id: string;
  /** Display name (basename without extension). */
  name: string;
  /** Absolute path on disk — present for real files opened via Tauri. */
  path?: string;
  /** Inline markdown content — used by the browser demo. */
  inline?: string;
}

/** A markdown file inside a folder tree — same shape as a loose doc. */
export type FileLeaf = DocFile;

export interface FolderNode {
  name: string;
  path: string;
  dirs: FolderNode[];
  files: FileLeaf[];
}

/** Result of scanning a folder (Rust `scan_folder` command). */
export interface ScanResult {
  root: FolderNode | null;
  totalFiles: number;
  truncated: boolean;
}

/** Result of classifying dropped paths (Rust `classify_paths` command). */
export interface PathInfo {
  path: string;
  isDir: boolean;
  exists: boolean;
}

export interface FileLibraryItem extends DocFile {
  kind: "file";
}

export interface FolderLibraryItem {
  kind: "folder";
  /** The folder's absolute path (or a synthetic `mem:` id in the browser). */
  id: string;
  name: string;
  path: string;
  /** null until scanned, or when the folder has no markdown files. */
  tree: FolderNode | null;
  truncated?: boolean;
  error?: string;
}

/** A top-level sidebar entry: a loose document or a whole folder. */
export type LibraryItem = FileLibraryItem | FolderLibraryItem;

export type ViewMode = "preview" | "edit";

/** Which surface the main area shows. */
export type MainView = "board" | "list" | "for-you" | "plan";
