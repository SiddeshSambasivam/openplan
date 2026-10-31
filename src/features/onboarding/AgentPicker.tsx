import { AgentMark } from "@/components/AgentIcons";
import type { AgentOption } from "@/lib/onboarding";
import { isMac } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { choiceCard, ChoiceCardBody } from "./ChoiceCard";

/**
 * The agent tools as logo cards. Installed ones can be picked, and show the
 * number key that toggles them. Missing ones are greyed out.
 */
export function AgentPicker({
  agents,
  picked,
  onToggle,
}: {
  agents: AgentOption[];
  picked: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div role="group" aria-label="Your agents" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {agents.map((agent, index) => {
        const checked = picked.includes(agent.id);
        return (
          <button
            key={agent.id}
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={!agent.installed}
            onClick={() => onToggle(agent.id)}
            className={cn(choiceCard, "p-4")}
          >
            <ChoiceCardBody
              picture={
                <span className="mb-3 grid size-9 place-items-center rounded-lg bg-muted short:mb-2 short:size-7">
                  <AgentMark
                    id={agent.id}
                    className={cn("size-5 text-foreground", !agent.installed && "grayscale")}
                  />
                </span>
              }
              label={agent.name}
              hint={agent.installed ? `Found on this ${isMac ? "Mac" : "computer"}` : "Not installed"}
              keyHint={agent.installed ? String(index + 1) : undefined}
              checked={checked}
            />
          </button>
        );
      })}
    </div>
  );
}
