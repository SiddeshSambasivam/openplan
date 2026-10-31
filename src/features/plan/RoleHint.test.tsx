import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RoleHint } from "./RoleHint";

describe("RoleHint", () => {
  it("shows nothing until the role is read, so a person with one never sees it flash", () => {
    expect(renderToStaticMarkup(<RoleHint />)).toBe("");
  });
});
