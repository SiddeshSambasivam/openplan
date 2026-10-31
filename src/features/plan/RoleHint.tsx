import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readRole, showsRoleHint } from "@/lib/personRoles";
import { openRoleSettings } from "@/lib/settingsRequests";

/** One line for a person with no role yet, with a way to pick one. The
 * role is read once, so a role picked since shows on the next visit. */
export function RoleHint() {
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => void readRole().then(setRole), []);
  if (!showsRoleHint(role)) return null;
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      Pick your role so the right people ask.
      <Button variant="outline" size="xs" onClick={openRoleSettings}>
        Open Settings
      </Button>
    </p>
  );
}
