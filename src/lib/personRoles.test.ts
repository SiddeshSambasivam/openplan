import { describe, expect, it } from "vitest";
import { panelCaption, PERSON_ROLES, personRole } from "./personRoles";
import { ROLES } from "./work";

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
