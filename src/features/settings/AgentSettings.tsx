import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { AgentPicker } from "@/features/onboarding/AgentPicker";
import { AgentSetup } from "@/features/onboarding/AgentSetup";
import { cn } from "@/lib/utils";
import {
  detectAgents,
  installTools,
  pickedByDefault,
  setupSettled,
  setupStep,
  togglePick,
  waitingRows,
  type AgentOption,
  type InstallStep,
  type SetupRow,
} from "@/lib/onboarding";

const HINT = "text-xs leading-5 text-muted-foreground";

/** The agent tools on this machine, and Set up, which runs the same setup
 * rows onboarding shows for the picked ones. */
export function AgentSettings() {
  const [agents, setAgents] = useState<AgentOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [rows, setRows] = useState<SetupRow[]>([]);

  useEffect(() => {
    void detectAgents(invoke)
      .then((found) => {
        setAgents(found);
        setPicked(pickedByDefault(found));
      })
      .catch(() => setAgents([]));
  }, []);

  const install = (tools: string[]) =>
    installTools(
      tools,
      (tool) => invoke<InstallStep[]>("install_tool", { tool }),
      (event) => setRows((old) => setupStep(old, event)),
    );

  const setUp = () => {
    setRows(waitingRows(picked));
    void install(picked);
  };

  if (!agents) {
    return (
      <p className={cn("mt-4 flex items-center gap-2", HINT)}>
        <LoaderCircle className="size-3.5 animate-spin" />
        Looking for agents on this computer
      </p>
    );
  }

  const running = !setupSettled(rows);
  const noneInstalled = !agents.some((agent) => agent.installed);
  return (
    <>
      <div className="mt-4">
        <AgentPicker
          agents={agents}
          picked={picked}
          onToggle={(id) => setPicked((old) => togglePick(agents, old, id))}
          keys={false}
        />
      </div>
      <p className={cn("mt-3", HINT)}>
        {noneInstalled
          ? "Install one of these agents, then come back here to set it up."
          : "Each one gets the OpenPlan server and a short note in its instructions. Nothing else in its files changes."}
      </p>
      <Button size="sm" className="mt-3" disabled={picked.length === 0 || running} onClick={setUp}>
        Set up
      </Button>
      {rows.length > 0 && (
        <div className="mt-4">
          <AgentSetup
            rows={rows}
            agentName={(id) => agents.find((agent) => agent.id === id)?.name ?? id}
            onRetry={(tool) => void install([tool])}
          />
          {rows.some((row) => row.status === "ready") && (
            <p className={cn("mt-2", HINT)}>An agent that is already open picks this up after a restart.</p>
          )}
        </div>
      )}
    </>
  );
}
