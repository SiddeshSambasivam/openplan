import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/work";
import { PersonaAvatar } from "./PersonaAvatar";

const avatar = (role?: string) => renderToStaticMarkup(<PersonaAvatar role={role as Role} />);

describe("PersonaAvatar", () => {
  it.each([
    ["product", "persona-pennant"],
    ["engineering", "persona-glasses"],
    ["design", "persona-beret"],
    ["oncall", "persona-siren"],
    ["research", "persona-lens"],
    ["accessibility", "persona-halo"],
    ["data", "persona-bars"],
    ["security", "persona-shield"],
    ["support", "persona-speech"],
  ])("draws %s with its own prop", (role, prop) => {
    const html = avatar(role);
    expect(html).toContain(`data-role="${role}"`);
    expect(html).toContain(`class="${prop}"`);
  });

  it("draws a plain grey sphere for a question from before roles", () => {
    const html = avatar();
    expect(html).toContain('data-role="agent"');
    expect(html).not.toMatch(/persona-(pennant|glasses|beret|siren|lens|halo|bars|shield|speech)/);
  });
});
