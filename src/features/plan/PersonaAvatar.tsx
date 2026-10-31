import { useEffect, useRef, type ReactNode } from "react";
import { isKnownRole, type Role } from "@/lib/work";
import { cn } from "@/lib/utils";
import { watchAvatar } from "./personaMotion";

/**
 * The face of the role that asks a question: a sphere in the role's colours
 * with one prop, drawn, not photographed, so nobody takes a persona for a
 * real person. A question from before roles, or from a role the app does
 * not know, gets a plain grey one. Size it
 * with a `text-*` class: the drawing is in em.
 */
export function PersonaAvatar({
  role,
  typing = false,
  className,
}: {
  role?: Role;
  /** Bobs, as if writing. */
  typing?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => (ref.current ? watchAvatar(ref.current) : undefined), []);
  const drawn = role && isKnownRole(role) ? role : undefined;
  return (
    <span
      ref={ref}
      aria-hidden
      data-role={drawn ?? "agent"}
      data-typing={typing ? "" : undefined}
      className={cn("persona", className)}
    >
      <span className="persona-head">
        <span className="persona-ball">
          <span className="persona-light" />
        </span>
        {drawn && drawn !== "engineering" && HATS[drawn]}
        <span className="persona-face">
          <span className="persona-eyes">
            <span className="persona-eye" />
            <span className="persona-eye" />
          </span>
          {drawn === "engineering" && (
            <span className="persona-glasses">
              <span className="persona-bridge" />
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/* Props that sit on the head and stay still while the face turns. The tech
 * lead's glasses sit on the face instead. */
const HATS: Record<Exclude<Role, "engineering">, ReactNode> = {
  product: <span className="persona-pennant" />,
  design: <span className="persona-beret" />,
  oncall: (
    <>
      <span className="persona-band" />
      <span className="persona-cup" />
      <span className="persona-cup" />
      <span className="persona-mic" />
      <span className="persona-siren" />
    </>
  ),
  research: <span className="persona-lens" />,
  accessibility: <span className="persona-halo" />,
  data: (
    <span className="persona-bars">
      <span />
      <span />
      <span />
    </span>
  ),
  security: <span className="persona-shield" />,
  support: <span className="persona-speech" />,
};
