import { useMemo } from "react";
import { Markdown } from "@/components/Markdown";
import {
  KIND_NAMES,
  missingSections,
  splitDecisions,
  splitSections,
  type PlanSection,
} from "@/lib/sections";

/** The canonical name for a section, when the heading says it differently.
 * "## Overview" reads as Summary; "## Summary" needs nothing said twice. */
function kicker(section: PlanSection): string | null {
  const name = KIND_NAMES[section.kind];
  if (!name) return null;
  return section.heading.toLowerCase().includes(name.toLowerCase()) ? null : name;
}

function Body({
  content,
  line,
  docPath,
  dark,
}: {
  content: string;
  line: number;
  docPath?: string;
  dark: boolean;
}) {
  // Each slice parses on its own, so the offset puts its stamps back into the
  // body's lines. Comments anchor to those stamps.
  return (
    <Markdown content={content} lineOffset={line - 1} docPath={docPath} dark={dark} />
  );
}

function Decisions({
  section,
  docPath,
  dark,
}: {
  section: PlanSection;
  docPath?: string;
  dark: boolean;
}) {
  const slices = useMemo(
    () => splitDecisions(section.body, section.line),
    [section.body, section.line],
  );
  return (
    <>
      {slices.map((slice) =>
        slice.card ? (
          <div key={slice.line} className="plan-decision">
            <Body content={slice.body} line={slice.line} docPath={docPath} dark={dark} />
          </div>
        ) : (
          <Body
            key={slice.line}
            content={slice.body}
            line={slice.line}
            docPath={docPath}
            dark={dark}
          />
        ),
      )}
    </>
  );
}

interface PlanPageProps {
  body: string;
  title: string;
  /** What kind of work the plan is, from its frontmatter. */
  type: string | null;
  docPath?: string;
  dark: boolean;
}

/**
 * A plan read as a page: a lead, then a block per section laid out by what
 * the section is. Every block still renders through the markdown renderer,
 * so the source-line stamps comments anchor to are untouched.
 */
export function PlanPage({ body, title, type, docPath, dark }: PlanPageProps) {
  const plan = useMemo(() => splitSections(body, title), [body, title]);
  const missing = useMemo(
    () => missingSections(type, plan.sections.map((section) => section.heading)),
    [type, plan.sections],
  );

  return (
    <div className="plan-page">
      {plan.lead && (
        <div className="plan-section" data-kind="summary">
          <Body
            content={plan.lead.body}
            line={plan.lead.line}
            docPath={docPath}
            dark={dark}
          />
        </div>
      )}
      {plan.sections.map((section) => {
        const name = kicker(section);
        return (
          <section key={section.line} className="plan-section" data-kind={section.kind}>
            {name && <p className="plan-section-kicker">{name}</p>}
            {section.kind === "decisions" ? (
              <Decisions section={section} docPath={docPath} dark={dark} />
            ) : (
              <Body
                content={section.body}
                line={section.line}
                docPath={docPath}
                dark={dark}
              />
            )}
          </section>
        );
      })}
      {missing.length > 0 && (
        <div className="mt-10 space-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
          {missing.map((section) => (
            <p key={section}>This plan has no {section} section yet.</p>
          ))}
        </div>
      )}
    </div>
  );
}
