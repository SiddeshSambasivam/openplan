import type { ReactNode } from "react";

/** The label over one block of the work record, with room on the right for
 * a count or a control. Not a document heading, so the outline skips it. */
export function WorkHeading({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-3">
      <h3 className="plan-section-kicker">{title}</h3>
      {aside && (
        <span className="ml-auto flex items-center text-xs text-muted-foreground">
          {aside}
        </span>
      )}
    </div>
  );
}
