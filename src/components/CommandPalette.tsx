import { useEffect, useImperativeHandle, useMemo, useState, type Ref } from "react";
import { TextSearch } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { matchPlans } from "@/lib/palette";
import { searchPlans, type PlanSummary, type SearchHit } from "@/lib/planBase";
import {
  groupShortcuts,
  SHORTCUTS,
  type ActionId,
  type ShortcutHandlers,
} from "@/lib/shortcuts";
import { ShortcutKeys } from "./ShortcutKeys";
import { StatusGlyph } from "./StatusGlyph";

/** Opening the palette from the palette, or closing it with its own entry,
 * is nothing anyone would pick. */
const NOT_LISTED: ActionId[] = ["palette", "escape"];

/** Content matches shown per plan; the plan opens on any of them. */
const HITS_PER_PLAN = 3;

/** Title matches shown at once. Mounting every plan would make opening the
 * palette cost more the bigger the base. */
const PLAN_MATCHES = 20;

/** Opens an overlay that keeps its own open state, so opening it renders the
 * overlay alone and not the whole app behind it. */
export interface OverlayHandle {
  open: () => void;
}

interface CommandPaletteProps {
  /** The same handlers the keys run. An action without one is left out. */
  handlers: ShortcutHandlers;
  plans: PlanSummary[];
  /** Shown before anything is typed. */
  recent: PlanSummary[];
  onOpenPlan: (plan: PlanSummary) => void;
}

/** Every action and every plan, filtered as you type, and the plans whose
 * text matches. Mounted only while open. */
export function CommandPalette({
  ref,
  ...props
}: CommandPaletteProps & { ref: Ref<OverlayHandle> }) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  return open ? <PaletteDialog {...props} onClose={() => setOpen(false)} /> : null;
}

function PaletteDialog({
  handlers,
  plans,
  recent,
  onOpenPlan,
  onClose,
}: CommandPaletteProps & { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const hitsByPlan = usePlanSearch(query.trim());
  const typed = query.trim() !== "";
  const planChoices = useMemo(
    () => (typed ? matchPlans(plans, query, PLAN_MATCHES) : recent),
    [typed, plans, query, recent],
  );
  const groups = useMemo(
    () =>
      groupShortcuts(
        SHORTCUTS.filter(
          (action) => !NOT_LISTED.includes(action.id) && handlers[action.id] != null,
        ),
      ),
    [handlers],
  );
  const byPath = useMemo(() => new Map(plans.map((plan) => [plan.path, plan])), [plans]);

  // Closing first gives back the focus the palette took, so whatever the
  // action opens next keeps it.
  const run = (action: (() => void) | undefined) => {
    onClose();
    action?.();
  };
  const openPlan = (plan: PlanSummary | undefined) => run(plan && (() => onOpenPlan(plan)));

  return (
    <CommandDialog
      open
      onOpenChange={(next) => !next && onClose()}
      title="Search and commands"
      description="Run an action, or open a plan by its title or its text."
      showCloseButton={false}
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a command or search plans"
      />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {groups.map(([group, actions]) => (
          <CommandGroup key={group} heading={group}>
            {actions.map((action) => (
              <CommandItem
                key={action.id}
                value={action.label}
                onSelect={() => run(handlers[action.id as ActionId])}
              >
                {action.label}
                <ShortcutKeys keys={action.keys} className="ml-auto" />
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {planChoices.length > 0 && (
          <CommandGroup heading={typed ? "Open a plan" : "Recent plans"}>
            {planChoices.map((plan) => (
              <CommandItem
                key={plan.path}
                // The id keeps two plans with one title apart.
                value={`${plan.title} ${plan.id}`}
                onSelect={() => openPlan(plan)}
              >
                <StatusGlyph status={plan.status} />
                <span className="truncate">{plan.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {hitsByPlan.length > 0 && (
          // The base already matched these on their text, so the palette's
          // own filter on titles must not hide them.
          <CommandGroup heading="In plans" forceMount>
            {hitsByPlan.map(([path, hits]) => (
              <CommandItem
                key={path}
                forceMount
                value={`text ${path}`}
                onSelect={() => openPlan(byPath.get(path))}
                className="flex-col items-start gap-0.5"
              >
                <span className="flex w-full items-center gap-2">
                  <TextSearch />
                  <span className="truncate">{hits[0].title}</span>
                </span>
                {hits.slice(0, HITS_PER_PLAN).map((hit) => (
                  <span
                    key={hit.line}
                    className="w-full truncate pl-6 text-xs text-muted-foreground"
                  >
                    <span className="tabular-nums opacity-60">{hit.line}</span> {hit.text}
                  </span>
                ))}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Searching reads the base on demand; the pause keeps a fast typist from
 * starting a scan per keystroke. */
function usePlanSearch(query: string): [string, SearchHit[]][] {
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    if (!query) {
      setHits([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      void searchPlans(query).then((found) => {
        if (!stale) setHits(found);
      });
    }, 150);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  return useMemo(() => {
    const grouped = new Map<string, SearchHit[]>();
    for (const hit of hits) {
      const group = grouped.get(hit.path);
      if (group) group.push(hit);
      else grouped.set(hit.path, [hit]);
    }
    return [...grouped.entries()];
  }, [hits]);
}
