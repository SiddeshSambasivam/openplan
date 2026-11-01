import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, type ReactNode } from "react";
import { AgentMark } from "@/components/AgentIcons";
import { Button } from "@/components/ui/button";
import { PersonaAvatar } from "@/features/plan/PersonaAvatar";
import { needsAgentSetup, sessionAgent, sessionHint } from "@/lib/board";
import { useWindowActive } from "@/lib/motion";
import { detectAgents, type AgentOption } from "@/lib/onboarding";
import { readPanel } from "@/lib/personRoles";
import { isTauri } from "@/lib/platform";
import { openAgentSettings } from "@/lib/settingsRequests";
import { DEFAULT_PANEL, type Role } from "@/lib/work";

/** The board with nothing on it: a scene of what a session with an agent
 * leads to, and the same in words. */
export function BoardEmptyState({
  title = "Start a session with your agent",
  children,
}: {
  title?: string;
  /** An action under the words. */
  children?: ReactNode;
}) {
  const active = useWindowActive();
  const agents = useAgents();
  const [panel, setPanel] = useState<Role[]>(DEFAULT_PANEL);
  useEffect(() => void readPanel().then(setPanel), []);
  return (
    <div className="flex h-full animate-in flex-col items-center justify-center gap-4 p-8 text-center fade-in duration-200">
      <Scene paused={!active} agent={sessionAgent(agents)} reviewers={panel.slice(0, 2)} />
      <div className="max-w-sm space-y-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="text-xs text-muted-foreground/80">{sessionHint(agents)}</p>
      </div>
      {needsAgentSetup(agents) && (
        <Button variant="outline" size="sm" onClick={openAgentSettings}>
          Set up an agent
        </Button>
      )}
      {children}
    </div>
  );
}

/* One loop on one clock: the request types, a plan lifts out of the
   session into Draft, two reviewers turn up with a question, and the scene
   rests before it fades and starts again. Each part's keyframes hold its
   place in that loop. Its resting style is the last frame, which reduced
   motion shows still. */
function Scene({ paused, agent, reviewers }: { paused: boolean; agent: string; reviewers: Role[] }) {
  return (
    <div aria-hidden data-paused={paused} className="session-scene relative h-36 w-60 text-left">
      <div className="absolute inset-y-0 right-0 top-14 w-32 rounded-lg border border-dashed px-2 py-1.5 text-xs text-muted-foreground">
        Draft
      </div>
      <div className="session-card absolute right-2 top-21 w-28 space-y-1.5 rounded-md border bg-card p-2 shadow-sm">
        <p className="text-xs font-medium text-card-foreground">Dark mode</p>
        <div className="h-1 w-20 rounded-full bg-muted" />
        <div className="h-1 w-14 rounded-full bg-muted" />
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-card-foreground shadow-sm">
        <AgentMark id={agent} className="size-3.5 shrink-0" />
        <span className="relative text-xs whitespace-nowrap">
          Plan dark mode for the notes app
          <span className="session-cover absolute inset-0 origin-right bg-card" />
        </span>
      </div>
      <div className="absolute top-22 left-10 flex gap-1">
        {reviewers.map((role) => (
          <span key={role} className="session-reviewer">
            <PersonaAvatar role={role} className="text-2xl" />
          </span>
        ))}
        <span className="session-question absolute -top-4 -right-4 grid size-5 place-items-center rounded-full border bg-popover text-xs font-medium text-popover-foreground shadow-sm">
          ?
        </span>
      </div>
    </div>
  );
}

/** The agents on this computer, or null until the search ends or when it
 * cannot run. */
function useAgents(): AgentOption[] | null {
  const [agents, setAgents] = useState<AgentOption[] | null>(null);
  useEffect(() => {
    if (!isTauri) return;
    void detectAgents(invoke)
      .then(setAgents)
      .catch(() => {});
  }, []);
  return agents;
}
