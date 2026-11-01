import { describe, expect, it } from "vitest";
import { panelCaption, panelFor, PERSON_ROLES, personRole, saveRole, showsRoleHint } from "./personRoles";
import { DEFAULT_PANEL, ROLES } from "./work";

describe("PERSON_ROLES", () => {
  it("lists the six roles in the order the cards show", () => {
    expect(PERSON_ROLES.map((role) => role.id)).toEqual([
      "engineer",
      "designer",
      "product",
      "lead",
      "founder",
      "other",
    ]);
    expect(personRole("designer")).toMatchObject({
      label: "Designer",
      hint: "I shape what people see",
    });
  });

  it("gives every role four different reviewers from the nine", () => {
    for (const role of PERSON_ROLES) {
      expect(new Set(role.panel).size).toBe(4);
      for (const reviewer of role.panel) expect(ROLES).toContain(reviewer);
    }
  });
});

describe("panelFor", () => {
  it("is the question roles of the person's panel, in its order", () => {
    expect(panelFor("designer")).toEqual(["design", "research", "accessibility", "engineering"]);
  });

  it("is the default panel for a person with no role, or one the app does not know", () => {
    expect(panelFor(null)).toEqual(DEFAULT_PANEL);
    expect(panelFor(undefined)).toEqual(DEFAULT_PANEL);
    expect(panelFor("astronaut")).toEqual(DEFAULT_PANEL);
  });
});

describe("panelCaption", () => {
  it("names the panel in its order", () => {
    expect(panelCaption("engineer")).toBe("Mila, Theo, Iris and Kai review every plan you write.");
    expect(panelCaption("designer")).toBe("Iris, Noor, Ada and Theo review every plan you write.");
    expect(panelCaption("product")).toBe("Remy, Juno, Iris and Theo review every plan you write.");
    expect(panelCaption("lead")).toBe("Theo, Kai, Sol and Mila review every plan you write.");
    expect(panelCaption("founder")).toBe("Mila, Theo, Iris and Remy review every plan you write.");
    expect(panelCaption("other")).toBe("Mila, Theo, Iris and Kai review every plan you write.");
  });
});

describe("saveRole", () => {
  it("saves a picked role, and clears it with none", async () => {
    const calls: [string, unknown][] = [];
    const call = async (command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return null;
    };

    await saveRole(call, "designer");
    await saveRole(call, null);

    expect(calls).toEqual([
      ["set_role", { role: "designer" }],
      ["set_role", { role: null }],
    ]);
  });

  it("passes on a save that fails", async () => {
    const call = async () => {
      throw "Couldn't write your settings.";
    };
    await expect(saveRole(call, "lead")).rejects.toBe("Couldn't write your settings.");
  });
});

describe("showsRoleHint", () => {
  it("asks only a person with no role, and not before the role is read", () => {
    expect(showsRoleHint(null)).toBe(true);
    expect(showsRoleHint("designer")).toBe(false);
    expect(showsRoleHint("a-role-from-a-newer-version")).toBe(false);
    expect(showsRoleHint(undefined)).toBe(false);
  });
});
