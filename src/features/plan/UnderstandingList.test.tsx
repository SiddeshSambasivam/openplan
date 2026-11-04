import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UnderstandingDrafts } from "@/lib/alignmentDrafts";
import type { Understanding, UnderstandingDraft } from "@/lib/work";
import { UnderstandingList } from "./UnderstandingList";

const stated = (area: string, extra: Partial<Understanding> = {}): Understanding => ({
  area,
  statement: `The agent's view of ${area}.`,
  by: "claude-code",
  ...extra,
});

const view = { dark: false, media: false };

function list(understanding: Understanding[], drafts: UnderstandingDrafts = {}, planType: string | null = "bug") {
  const drafted: [string, UnderstandingDraft | null][] = [];
  const element = (
    <UnderstandingList
      understanding={understanding}
      drafts={drafts}
      planType={planType}
      onDraft={(area, draft) => drafted.push([area, draft])}
      view={view}
    />
  );
  return { html: renderToStaticMarkup(element), element, drafted };
}

/** The props of every element in the tree whose text includes `label`,
 * calling function components on the way, since none of them use hooks. */
function propsOf(node: ReactNode, label: string): Record<string, unknown>[] {
  if (Array.isArray(node)) return node.flatMap((child) => propsOf(child, label));
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  if (typeof element.type === "function" && element.type.name.startsWith("Understanding")) {
    return propsOf((element.type as (props: unknown) => ReactNode)(element.props), label);
  }
  const children = element.props.children as ReactNode;
  const own = textOf(children).includes(label) && typeof element.props.onClick === "function" ? [element.props] : [];
  return [...own, ...propsOf(children, label)];
}

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  return "";
}

describe("UnderstandingList", () => {
  it("shows one row per required area in order, with its state", () => {
    const { html } = list([
      stated("scale", { confirmed: { by: "Sid", at: "x" } }),
      stated("error handling", { correction: { text: "Retries stop after three.", by: "Sid", at: "x" } }),
      stated("edge cases"),
    ]);

    const rows = [...html.matchAll(/data-area="([^"]+)"/g)].map((match) => match[1]);
    expect(rows).toEqual(["edge cases", "error handling", "scale"]);
    expect(html).toContain("Waiting for you");
    expect(html).toContain("Confirmed by Sid.");
    expect(html).toContain("Retries stop after three.");
    expect(html).toContain("Waiting for the agent to restate.");
    expect(html).toContain("The agent&#x27;s view of scale.");
  });

  it("says when the agent has not stated an area, and offers no controls there", () => {
    const { html } = list([], {}, "feature");

    expect(html.match(/The agent has not stated its understanding yet\./g)).toHaveLength(5);
    expect(html).toContain("Not stated");
    expect(html).not.toContain("Confirm</button>");
  });

  it("drafts a confirmation, and takes it back on a second press", () => {
    const fresh = list([stated("scale")]);
    (propsOf(fresh.element, "Confirm")[0].onClick as () => void)();
    expect(fresh.drafted).toEqual([["scale", { confirm: true }]]);

    const drafted = list([stated("scale")], { scale: { confirm: true } });
    expect(drafted.html).toContain('aria-pressed="true"');
    expect(drafted.html).toContain("Confirmed. Not sent yet.");
    (propsOf(drafted.element, "Confirm")[0].onClick as () => void)();
    expect(drafted.drafted).toEqual([["scale", null]]);
  });

  it("opens a box for the correction and keeps what the person wrote as the draft", () => {
    const fresh = list([stated("scale")]);
    (propsOf(fresh.element, "Correct")[0].onClick as () => void)();
    expect(fresh.drafted).toEqual([["scale", { correct: "" }]]);

    const writing = list([stated("scale")], { scale: { correct: "Thousands of plans." } });
    expect(writing.html).toContain("<textarea");
    expect(writing.html).toContain("Thousands of plans.");
    expect(writing.html).toContain("Corrected");
  });
});
