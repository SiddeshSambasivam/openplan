import { describe, expect, it } from "vitest";
import {
  allFolders,
  filterByFolder,
  folderChoices,
  folderName,
  toggleFolder,
} from "./folders";
import type { PlanSummary } from "./planBase";

function plan(id: string, folders: string[]): PlanSummary {
  return {
    id,
    title: id,
    status: "draft",
    type: null,
    source: "claude-code",
    folders,
    pr: null,
    created: null,
    updated: null,
    completed: null,
    path: `/base/${id}.md`,
    relativePath: `${id}.md`,
    documents: [],
  };
}

describe("allFolders", () => {
  it("lists every folder in the base once, in order", () => {
    const plans = [
      plan("a", ["Search", "Infra"]),
      plan("b", ["search", "Billing"]),
      plan("c", []),
    ];

    expect(allFolders(plans)).toEqual(["Billing", "Infra", "Search"]);
  });

  it("has nothing to list when no plan is in a folder", () => {
    expect(allFolders([plan("a", [])])).toEqual([]);
  });
});

describe("filterByFolder", () => {
  const plans = [plan("one", ["Search"]), plan("two", ["Infra", "Search"]), plan("loose", [])];

  it("keeps every plan when no folder is chosen", () => {
    expect(filterByFolder(plans, null)).toHaveLength(3);
  });

  it("keeps the plans in one folder, whatever the case", () => {
    expect(filterByFolder(plans, "search").map((p) => p.id)).toEqual(["one", "two"]);
    expect(filterByFolder(plans, "Infra").map((p) => p.id)).toEqual(["two"]);
  });

  it("finds nothing in a folder no plan is in", () => {
    expect(filterByFolder(plans, "Billing")).toEqual([]);
  });
});

describe("toggleFolder", () => {
  it("adds a folder the plan is not in", () => {
    expect(toggleFolder(["Search"], "Infra")).toEqual(["Search", "Infra"]);
  });

  it("takes the plan out of a folder it is in, whatever the case", () => {
    expect(toggleFolder(["Search", "Infra"], "search")).toEqual(["Infra"]);
  });

  it("uses the spelling the base already has", () => {
    expect(toggleFolder([], " q3 launch ", ["Q3 launch"])).toEqual(["Q3 launch"]);
  });

  it("ignores a name that is only spaces", () => {
    expect(toggleFolder(["Search"], "   ")).toEqual(["Search"]);
  });

  it("stores the name the way the plan file will", () => {
    expect(toggleFolder([], "Q3, launch")).toEqual(["Q3 launch"]);
  });
});

describe("folderName", () => {
  it("drops what would break the list in the plan file", () => {
    expect(folderName("  Q3   launch ")).toBe("Q3 launch");
    expect(folderName('a, [b]: #c "d"')).toBe("a b c d");
    expect(folderName(" , ")).toBe("");
  });
});

describe("folderChoices", () => {
  const known = ["Billing", "Infra", "Search"];

  it("offers every folder before anything is typed", () => {
    expect(folderChoices(known, ["Search"], "")).toEqual({ names: known, addable: null });
  });

  it("narrows to the names that match and offers a new one", () => {
    expect(folderChoices(known, [], "in")).toEqual({ names: ["Billing", "Infra"], addable: "in" });
  });

  it("offers no new folder when the name is already there", () => {
    expect(folderChoices(known, [], "infra").addable).toBe(null);
  });

  it("offers the plan's own folders even if no other plan has them", () => {
    expect(folderChoices([], ["Drafts"], "").names).toEqual(["Drafts"]);
  });
});
