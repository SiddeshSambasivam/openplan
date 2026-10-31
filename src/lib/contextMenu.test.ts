import { describe, expect, it } from "vitest";
import { keepsNativeMenu, type MenuTarget } from "./contextMenu";

function node(
  tagName: string,
  parentElement: MenuTarget | null = null,
  extra: Partial<MenuTarget> = {},
): MenuTarget {
  return { tagName, parentElement, ...extra };
}

const page = node("BODY");
const cm = (name: string) => ({ contains: (c: string) => c === name });

describe("keepsNativeMenu", () => {
  it("hides the webview's menu on the app's own surfaces", () => {
    expect(keepsNativeMenu(node("DIV", page), "")).toBe(false);
    expect(keepsNativeMenu(node("BUTTON", node("DIV", page)), "")).toBe(false);
    expect(keepsNativeMenu(null, "")).toBe(false);
  });

  it("keeps it in an input and a textarea", () => {
    expect(keepsNativeMenu(node("INPUT", page), "")).toBe(true);
    expect(keepsNativeMenu(node("TEXTAREA", page), "")).toBe(true);
  });

  it("keeps it in editable content", () => {
    const editable = node("DIV", page, { isContentEditable: true });
    expect(keepsNativeMenu(node("SPAN", editable, { isContentEditable: true }), "")).toBe(true);
  });

  it("keeps it anywhere inside the editor, its gutter included", () => {
    const editor = node("DIV", page, { classList: cm("cm-editor") });
    expect(keepsNativeMenu(node("DIV", node("DIV", editor)), "")).toBe(true);
  });

  it("keeps it while text is selected, so Copy works", () => {
    expect(keepsNativeMenu(node("P", page), "some words")).toBe(true);
    expect(keepsNativeMenu(node("P", page), "  \n")).toBe(false);
  });
});
