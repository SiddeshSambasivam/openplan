import { Badge } from "@/components/ui/badge";
import { PersonaAvatar } from "@/features/plan/PersonaAvatar";
import { panelCaption, personRole, type PersonRoleId } from "@/lib/personRoles";
import { PERSONAS } from "@/lib/work";
import { cn } from "@/lib/utils";

/**
 * The four reviewers a role brings, each with what they ask about and how
 * deep, and one line that says it in words. Before a role is picked, the
 * first role's panel shows faded.
 */
export function PanelPreview({ role }: { role: PersonRoleId | null }) {
  const shown = personRole(role ?? "engineer");
  return (
    <div className="rounded-xl border bg-card/80 px-3 pt-4 pb-3 short:px-2.5 short:pt-2.5 short:pb-2">
      <ul
        key={shown.id}
        className={cn("grid grid-cols-4 gap-1.5 transition-opacity duration-400", !role && "opacity-40")}
      >
        {shown.panel.map((member, index) => {
          const persona = PERSONAS[member.role];
          return (
            <li
              key={member.role}
              className="flex animate-in flex-col items-center text-center fade-in slide-in-from-bottom-3 duration-500 fill-mode-backwards"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <PersonaAvatar role={member.role} className="text-4xl short:text-3xl" />
              <span className="mt-2.5 text-sm font-medium short:mt-1.5">
                {persona.name} · {persona.title}
              </span>
              <span className="max-w-36 text-xs leading-snug text-muted-foreground short:hidden">
                {persona.focus}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "mt-1.5 font-normal short:mt-1",
                  member.voice === "deep" ? "border-foreground/30" : "text-muted-foreground",
                )}
              >
                {member.voice === "deep" ? "In depth" : "Plain words"}
              </Badge>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 min-h-5 text-center text-sm text-muted-foreground short:mt-1.5">
        {role ? panelCaption(role) : "Pick a role to meet your reviewers."}
      </p>
    </div>
  );
}
