import { PersonaAvatar } from "@/features/plan/PersonaAvatar";
import { panelCaption, personRole, type PersonRoleId } from "@/lib/personRoles";
import { PERSONAS } from "@/lib/work";
import { cn } from "@/lib/utils";

/**
 * The four reviewers a role brings, each with their title and what they ask
 * about, and one line that names them. Before a role is picked, the first
 * role's panel shows faded.
 */
export function PanelPreview({ role }: { role: PersonRoleId | null }) {
  const shown = personRole(role ?? "engineer");
  return (
    <div className="rounded-xl border bg-card/80 px-5 pt-6 pb-5 short:px-4 short:pt-3.5 short:pb-3">
      <ul
        key={shown.id}
        className={cn(
          "grid grid-cols-4 gap-4 transition-opacity duration-400 short:gap-3",
          !role && "opacity-40",
        )}
      >
        {shown.panel.map((reviewer, index) => {
          const persona = PERSONAS[reviewer];
          return (
            <li
              key={reviewer}
              className="flex animate-in flex-col items-center text-center fade-in slide-in-from-bottom-3 duration-500 fill-mode-backwards"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <PersonaAvatar role={reviewer} className="text-4xl short:text-3xl" />
              <span className="mt-3 text-sm font-medium short:mt-2">{persona.name}</span>
              <span className="text-xs text-muted-foreground">{persona.title}</span>
              <span className="mt-2 max-w-36 text-xs leading-snug text-balance text-muted-foreground short:hidden">
                {persona.focus}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 min-h-5 text-center text-sm text-muted-foreground short:mt-3">
        {role ? panelCaption(role) : "Pick a role to meet your reviewers."}
      </p>
    </div>
  );
}
