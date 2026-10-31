import { useEffect, useRef } from "react";
import { isMac } from "./platform";

export type Platform = "mac" | "other";

export interface Shortcut {
  id: string;
  label: string;
  /** Platform-neutral: `mod` is ⌘ on macOS and Ctrl elsewhere. */
  keys: string;
  group: string;
  /** When the key does something, for the shortcut sheet. */
  when?: string;
  /** Fires from inside a text field too. Only for chords the editor needs. */
  whileTyping?: boolean;
}

/** Every action with a key. Buttons, menus, the palette and the key itself
 * all read the label and the key from here. */
export const SHORTCUTS = [
  { id: "palette", label: "Search and commands", keys: "mod+k", group: "General" },
  { id: "shortcuts", label: "Keyboard shortcuts", keys: "?", group: "General" },
  { id: "settings", label: "Settings", keys: "mod+,", group: "General" },
  { id: "navbar", label: "Show or hide the sidebar", keys: "mod+b", group: "General" },
  { id: "rail", label: "Sidebar as icons", keys: "mod+shift+b", group: "General" },
  { id: "theme", label: "Switch theme", keys: "mod+shift+l", group: "General" },
  { id: "openFile", label: "Open a file", keys: "mod+o", group: "General" },
  { id: "openFolder", label: "Open a folder", keys: "mod+shift+o", group: "General" },
  {
    id: "escape",
    label: "Close the top panel",
    keys: "escape",
    group: "General",
    whileTyping: true,
  },
  { id: "board", label: "Board", keys: "mod+1", group: "Views" },
  { id: "list", label: "All plans", keys: "mod+2", group: "Views" },
  { id: "forYou", label: "For you", keys: "mod+3", group: "Views" },
  {
    id: "plan",
    label: "Open plan",
    keys: "mod+4",
    group: "Views",
    when: "The open plan, or the last one you read",
  },
  {
    id: "previousPlan",
    label: "Previous plan",
    keys: "[",
    group: "Views",
    when: "In the order of the last view",
  },
  {
    id: "nextPlan",
    label: "Next plan",
    keys: "]",
    group: "Views",
    when: "In the order of the last view",
  },
  {
    id: "edit",
    label: "Edit or preview",
    keys: "mod+e",
    group: "Plan",
    whileTyping: true,
  },
  { id: "save", label: "Save", keys: "mod+s", group: "Plan", whileTyping: true },
  { id: "find", label: "Find in plan", keys: "mod+f", group: "Plan", when: "In the preview" },
  { id: "outline", label: "Outline", keys: "mod+\\", group: "Plan", when: "In the preview" },
  { id: "history", label: "History", keys: "mod+h", group: "Plan" },
  { id: "status", label: "Change status", keys: "mod+shift+s", group: "Plan" },
  { id: "folders", label: "Folders", keys: "mod+shift+f", group: "Plan", when: "In the preview" },
  { id: "archive", label: "Archive plan", keys: "mod+shift+a", group: "Plan" },
  { id: "comments", label: "Comments", keys: "mod+shift+c", group: "Review", when: "In the preview" },
  {
    id: "sendReview",
    label: "Send review",
    keys: "mod+enter",
    group: "Review",
    when: "With the comments panel open",
  },
] as const satisfies readonly Shortcut[];

export type ActionId = (typeof SHORTCUTS)[number]["id"];

/** A handler per action. A missing one means the action does nothing here
 * and now, so its key is left to the browser and the palette leaves it out. */
export type ShortcutHandlers = Partial<Record<ActionId, (() => void) | undefined>>;

export interface KeyPress {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export const PLATFORM: Platform = isMac ? "mac" : "other";

export function shortcut(id: ActionId): Shortcut {
  return BY_ID.get(id)!;
}

/** The key's parts, one per `kbd`: ⇧ ⌘ A on macOS, Ctrl Shift A elsewhere. */
export function formatKeys(keys: string, platform: Platform): string[] {
  const { mod, shift, key } = parseKeys(keys);
  const names = platform === "mac" ? MAC_NAMES : OTHER_NAMES;
  const shown = names[key] ?? key.toUpperCase();
  const modifiers =
    platform === "mac"
      ? [shift && names.shift, mod && names.mod]
      : [mod && names.mod, shift && names.shift];
  return [...modifiers.filter((part): part is string => Boolean(part)), shown];
}

/** The key as one string: ⌘B on macOS, Ctrl+B elsewhere. */
export function keysLabel(keys: string, platform: Platform): string {
  return formatKeys(keys, platform).join(platform === "mac" ? "" : "+");
}

export function shortcutKeys(id: ActionId): string[] {
  return formatKeys(shortcut(id).keys, PLATFORM);
}

export function parseKeys(keys: string): { mod: boolean; shift: boolean; key: string } {
  const parts = keys.split("+");
  const key = parts.pop() ?? "";
  const known = key.length === 1 || NAMED_KEYS.includes(key);
  if (!known || parts.some((part) => part !== "mod" && part !== "shift")) {
    throw new Error(`Unknown key: ${keys}`);
  }
  return { mod: parts.includes("mod"), shift: parts.includes("shift"), key };
}

/**
 * The action a key press asks for. Chords need exactly the platform's own
 * modifier: holding the other one too means the chord belongs to the system
 * (⌃⌘F full-screens on macOS). A bare key ignores shift, which is part of
 * the character on most layouts.
 */
export function shortcutFor(
  press: KeyPress,
  platform: Platform,
  typing: boolean,
): ActionId | null {
  const ours = platform === "mac" ? press.metaKey : press.ctrlKey;
  const theirs = platform === "mac" ? press.ctrlKey : press.metaKey;
  if (press.altKey || theirs) return null;
  const key = press.key.toLowerCase();
  const chord = ours ? `mod+${press.shiftKey ? "shift+" : ""}${key}` : key;
  const action = BY_KEYS.get(chord);
  if (!action || (typing && !action.whileTyping)) return null;
  return action.id as ActionId;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return element.isContentEditable === true || TEXT_TAGS.includes(element.tagName);
}

/**
 * Binds the registry to the handlers with one window listener. The handlers
 * are read when a key arrives, so passing new ones costs nothing. A key
 * something else already handled, an open menu's Escape say, is left alone.
 */
export function useShortcuts(handlers: ShortcutHandlers): void {
  const current = useRef(handlers);
  current.current = handlers;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const id = shortcutFor(event, PLATFORM, isTypingTarget(event.target));
      const run = id ? current.current[id] : undefined;
      if (!run) return;
      event.preventDefault();
      run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

const MAC_NAMES: Record<string, string> = {
  mod: "⌘",
  shift: "⇧",
  enter: "↩",
  escape: "Esc",
};

const OTHER_NAMES: Record<string, string> = {
  mod: "Ctrl",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
};

const NAMED_KEYS = ["enter", "escape"];

const TEXT_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

const BY_ID = new Map<string, Shortcut>(SHORTCUTS.map((action) => [action.id, action]));

const BY_KEYS = new Map<string, Shortcut>(SHORTCUTS.map((action) => [action.keys, action]));
