import { useEffect, useRef, type ReactNode } from "react";
import type { Role } from "@/lib/work";
import { cn } from "@/lib/utils";
import { watchAvatar } from "./personaMotion";

/**
 * The face of the role that asks a question: a sphere in the role's colours
 * with one prop, drawn, not photographed, so nobody takes a persona for a
 * real person. A question from before roles gets a plain grey one. Size it
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
  return (
    <span
      ref={ref}
      aria-hidden
      data-role={role ?? "agent"}
      data-typing={typing ? "" : undefined}
      className={cn("persona", className)}
    >
      <span className="persona-head">
        <span className="persona-ball">
          <span className="persona-light" />
        </span>
        {role && HATS[role]}
        <span className="persona-face">
          <span className="persona-eyes">
            <span className="persona-eye" />
            <span className="persona-eye" />
          </span>
          {role === "engineering" && (
            <span className="persona-glasses">
              <span className="persona-bridge" />
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/* Props that sit on the head and stay still while the face turns. */
const HATS: Partial<Record<Role, ReactNode>> = {
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
};
