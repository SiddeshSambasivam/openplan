import { describe, expect, it } from "vitest";
import {
  formatKeys,
  groupShortcuts,
  isTypingTarget,
  keysLabel,
  parseKeys,
  SHORTCUTS,
  shortcutFor,
  type KeyPress,
  type Platform,
} from "./shortcuts";

function press(key: string, mods: Partial<KeyPress> = {}): KeyPress {
  return { key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods };
}

/** The key event a person makes for a registry key string on a platform. */
function pressFor(keys: string, platform: Platform): KeyPress {
  const { mod, alt, shift, key } = parseKeys(keys);
  const names: Record<string, string> = {
    enter: "Enter",
    escape: "Escape",
    backspace: "Backspace",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
  };
  const name = names[key] ?? key;
  return press(shift ? name.toUpperCase() : name, {
    metaKey: mod && platform === "mac",
    ctrlKey: mod && platform === "other",
    altKey: alt,
    shiftKey: shift || key === "?",
  });
}

describe("formatKeys", () => {
  it("renders the macOS symbols, shift before command", () => {
    expect(formatKeys("mod+b", "mac")).toEqual(["⌘", "B"]);
    expect(formatKeys("mod+shift+a", "mac")).toEqual(["⇧", "⌘", "A"]);
    expect(formatKeys("mod+enter", "mac")).toEqual(["⌘", "↩"]);
    expect(formatKeys("mod+\\", "mac")).toEqual(["⌘", "\\"]);
    expect(formatKeys("mod+backspace", "mac")).toEqual(["⌘", "⌫"]);
    expect(keysLabel("mod+b", "mac")).toBe("⌘B");
  });

  it("spells the modifiers out elsewhere", () => {
    expect(formatKeys("mod+b", "other")).toEqual(["Ctrl", "B"]);
    expect(formatKeys("mod+shift+a", "other")).toEqual(["Ctrl", "Shift", "A"]);
    expect(formatKeys("mod+enter", "other")).toEqual(["Ctrl", "Enter"]);
    expect(formatKeys("mod+backspace", "other")).toEqual(["Ctrl", "Backspace"]);
    expect(keysLabel("mod+shift+a", "other")).toBe("Ctrl+Shift+A");
  });

  it("orders option like the system does and names the arrows", () => {
    expect(formatKeys("mod+alt+arrowleft", "mac")).toEqual(["⌥", "⌘", "←"]);
    expect(formatKeys("mod+alt+arrowright", "other")).toEqual(["Ctrl", "Alt", "→"]);
  });

  it("shows a bare key as itself", () => {
    expect(formatKeys("?", "mac")).toEqual(["?"]);
    expect(formatKeys("[", "other")).toEqual(["["]);
    expect(formatKeys("escape", "mac")).toEqual(["Esc"]);
  });
});

describe("shortcutFor", () => {
  it("needs exactly the platform's own modifier", () => {
    expect(shortcutFor(press("b", { metaKey: true }), "mac", false)).toBe("navbar");
    expect(shortcutFor(press("b", { ctrlKey: true }), "other", false)).toBe("navbar");
    expect(shortcutFor(press("b", { ctrlKey: true }), "mac", false)).toBeNull();
    expect(shortcutFor(press("b", { metaKey: true }), "other", false)).toBeNull();
    // ⌃⌘F full-screens on macOS.
    expect(shortcutFor(press("f", { metaKey: true, ctrlKey: true }), "mac", false)).toBeNull();
    expect(shortcutFor(press("b", { metaKey: true, altKey: true }), "mac", false)).toBeNull();
  });

  it("tells a chord with shift from the one without", () => {
    expect(shortcutFor(press("B", { metaKey: true, shiftKey: true }), "mac", false)).toBeNull();
    expect(shortcutFor(press("s", { metaKey: true }), "mac", false)).toBe("save");
    expect(shortcutFor(press("S", { metaKey: true, shiftKey: true }), "mac", false)).toBe("status");
  });

  it("reads a bracket chord with shift whether the key arrives shifted or not", () => {
    for (const key of ["[", "{"]) {
      expect(shortcutFor(press(key, { metaKey: true, shiftKey: true }), "mac", false)).toBe(
        "previousNavItem",
      );
    }
    for (const key of ["]", "}"]) {
      expect(shortcutFor(press(key, { ctrlKey: true, shiftKey: true }), "other", false)).toBe(
        "nextNavItem",
      );
    }
  });

  it("reads a bare key without its modifiers", () => {
    expect(shortcutFor(press("["), "mac", false)).toBe("previousPlan");
    expect(shortcutFor(press("?", { shiftKey: true }), "other", false)).toBe("shortcuts");
    expect(shortcutFor(press("Escape"), "mac", false)).toBe("escape");
    expect(shortcutFor(press("[", { metaKey: true }), "mac", false)).toBeNull();
    expect(shortcutFor(press("x"), "mac", false)).toBeNull();
  });

  it("fires nothing while typing except Escape and the editor's own chords", () => {
    expect(shortcutFor(press("["), "mac", true)).toBeNull();
    expect(shortcutFor(press("?", { shiftKey: true }), "mac", true)).toBeNull();
    expect(shortcutFor(press("b", { metaKey: true }), "mac", true)).toBeNull();
    expect(shortcutFor(press("Escape"), "mac", true)).toBe("escape");
    expect(shortcutFor(press("e", { metaKey: true }), "mac", true)).toBe("edit");
    expect(shortcutFor(press("s", { metaKey: true }), "mac", true)).toBe("save");
    expect(shortcutFor(press("a", { metaKey: true }), "mac", true)).toBeNull();
    expect(shortcutFor(press("Backspace", { metaKey: true }), "mac", true)).toBeNull();
  });

  it("selects every plan and deletes with the platform's chords", () => {
    expect(shortcutFor(press("a", { metaKey: true }), "mac", false)).toBe("selectAll");
    expect(shortcutFor(press("Backspace", { metaKey: true }), "mac", false)).toBe("deletePlans");
    expect(shortcutFor(press("Backspace", { ctrlKey: true }), "other", false)).toBe("deletePlans");
  });

  it("steps between a plan's tabs with option and the platform's modifier", () => {
    expect(shortcutFor(press("ArrowLeft", { metaKey: true, altKey: true }), "mac", false)).toBe("previousTab");
    expect(shortcutFor(press("ArrowRight", { ctrlKey: true, altKey: true }), "other", false)).toBe("nextTab");
    expect(shortcutFor(press("ArrowRight", { metaKey: true }), "mac", false)).toBeNull();
    expect(shortcutFor(press("ArrowRight", { altKey: true }), "mac", false)).toBeNull();
    expect(shortcutFor(press("ArrowLeft", { metaKey: true, altKey: true }), "mac", true)).toBeNull();
  });

  it("builds with shift added to the send review chord", () => {
    expect(shortcutFor(press("Enter", { metaKey: true, shiftKey: true }), "mac", false)).toBe("build");
    expect(shortcutFor(press("Enter", { ctrlKey: true, shiftKey: true }), "other", false)).toBe("build");
    expect(shortcutFor(press("Enter", { metaKey: true }), "mac", false)).toBe("sendReview");
    expect(shortcutFor(press("Enter", { metaKey: true, shiftKey: true }), "mac", true)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  const el = (tagName: string, isContentEditable = false) =>
    ({ tagName, isContentEditable }) as unknown as EventTarget;

  it("is true for text fields and editable content", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", true))).toBe(true);
  });

  it("is false for everything else", () => {
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("BODY"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("the registry", () => {
  it("gives every action a label and a group", () => {
    for (const action of SHORTCUTS) {
      expect(action.label.trim(), action.id).not.toBe("");
      expect(action.group.trim(), action.id).not.toBe("");
    }
  });

  it("has one navbar key, which expands and collapses it", () => {
    const navbarKeys = SHORTCUTS.filter((action) => action.keys.endsWith("+b"));
    expect(navbarKeys.map((action) => action.id)).toEqual(["navbar"]);
    expect(SHORTCUTS.some((action) => (action.id as string) === "rail")).toBe(false);
  });

  it("has unique ids and unique keys", () => {
    const ids = SHORTCUTS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = SHORTCUTS.map((action) => action.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only uses keys it can read back from a key press, on both platforms", () => {
    for (const platform of ["mac", "other"] as const) {
      for (const action of SHORTCUTS) {
        expect(shortcutFor(pressFor(action.keys, platform), platform, false), action.keys).toBe(
          action.id,
        );
      }
    }
  });

  it("refuses a key string it does not know", () => {
    expect(() => parseKeys("hyper+b")).toThrow();
    expect(() => parseKeys("mod+")).toThrow();
  });
});

describe("groupShortcuts", () => {
  it("keeps the registry's order of groups and of actions inside them", () => {
    const groups = groupShortcuts(SHORTCUTS);
    expect(groups.map(([group]) => group)).toEqual(["General", "Views", "Plan", "Review"]);
    expect(groups.flatMap(([, actions]) => actions)).toEqual([...SHORTCUTS]);
  });

  it("drops a group with nothing left in it", () => {
    const some = SHORTCUTS.filter((action) => action.group !== "Views");
    expect(groupShortcuts(some).map(([group]) => group)).toEqual(["General", "Plan", "Review"]);
  });
});
