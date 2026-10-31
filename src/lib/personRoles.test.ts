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
      const reviewers = role.panel.map((member) => member.role);
      expect(new Set(reviewers).size).toBe(4);
      for (const member of role.panel) {
        expect(ROLES).toContain(member.role);
        expect(["deep", "plain"]).toContain(member.voice);
      }
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
  it("says who goes into depth and who keeps to plain words", () => {
    expect(panelCaption("engineer")).toBe(
      "Theo and Kai go into depth. Mila and Iris keep to plain words.",
    );
    expect(panelCaption("designer")).toBe(
      "Iris, Noor and Ada go into depth. Theo keeps to plain words.",
    );
    expect(panelCaption("product")).toBe(
      "Remy and Juno go into depth. Iris and Theo keep to plain words.",
    );
    expect(panelCaption("lead")).toBe(
      "Theo, Kai and Sol go into depth. Mila keeps to plain words.",
    );
  });

  it("says the person makes every call when everyone goes into depth", () => {
    expect(panelCaption("founder")).toBe(
      "Mila, Theo, Iris and Remy all go into depth. You make every call.",
    );
  });

  it("says everyone keeps to the essentials when nobody goes into depth", () => {
    expect(panelCaption("other")).toBe(
      "Mila, Theo, Iris and Kai ask the essentials, in plain words.",
    );
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
