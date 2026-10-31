import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { PanelPreview } from "@/features/onboarding/PanelPreview";
import { RolePicker } from "@/features/onboarding/RolePicker";
import { PERSON_ROLES, readRole, saveRole, type PersonRoleId } from "@/lib/personRoles";

/** The person's role and the reviewers it brings. Each pick saves at once.
 * `reveal` scrolls the row into view, for a request to open it. */
export function RoleSettings({ reveal }: { reveal: boolean }) {
  const [role, setRole] = useState<PersonRoleId | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLHeadingElement>(null);

  // A role from a newer version shows as none here and stays saved until
  // the person picks another.
  useEffect(() => {
    void readRole().then((read) => setRole(PERSON_ROLES.find((known) => known.id === read)?.id ?? null));
  }, []);

  useEffect(() => {
    if (reveal) ref.current?.scrollIntoView({ block: "start" });
  }, [reveal]);

  const choose = async (next: PersonRoleId | null) => {
    setError(null);
    try {
      await saveRole(invoke, next);
      setRole(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (problem) {
      setError(String(problem));
    }
  };

  return (
    <section aria-labelledby="settings-role" className="mt-6 border-t border-border pt-5">
      {/* Revealed from the heading, so the rule above it scrolls out of view. */}
      <h3 ref={ref} id="settings-role" className="scroll-mt-4 text-sm text-foreground">
        Role
      </h3>
      <p className="mt-1 mb-3 text-xs leading-5 text-muted-foreground">
        Every plan gets questions from four reviewers. Your role decides who they are.
      </p>
      <RolePicker value={role} onChange={(next) => void choose(next)} compact />
      <div className="mt-3">
        <PanelPreview role={role} />
      </div>
      <div className="mt-2 flex min-h-7 items-center gap-3">
        {role && (
          <Button variant="ghost" size="sm" onClick={() => void choose(null)} className="-ml-2.5">
            Clear role
          </Button>
        )}
        {saved ? (
          <span className="animate-in text-xs text-muted-foreground fade-in">
            Saved. Agents will use this from their next plan.
          </span>
        ) : (
          role && <span className="text-xs text-muted-foreground">Your agents ask the way they did before.</span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </section>
  );
}
