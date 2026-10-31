import { useImperativeHandle, useState, type Ref } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { groupShortcuts, SHORTCUTS } from "@/lib/shortcuts";
import type { OverlayHandle } from "./CommandPalette";
import { ShortcutKeys } from "./ShortcutKeys";

const GROUPS = groupShortcuts(SHORTCUTS);

/** Every key the app has, from the registry. Mounted only while open. */
export function ShortcutSheet({ ref }: { ref: Ref<OverlayHandle> }) {
  const [open, setOpen] = useState(false);
  useImperativeHandle(ref, () => ({ open: () => setOpen(true) }), []);
  if (!open) return null;
  return (
    <Sheet open onOpenChange={setOpen}>
      <SheetContent className="gap-0 rounded-l-lg">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            While you type in a field, only Esc, Save and Edit or preview work.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          {GROUPS.map(([group, actions]) => (
            <section key={group}>
              <h3 className="pb-1.5 text-xs font-medium text-muted-foreground">{group}</h3>
              <ul className="space-y-0.5">
                {actions.map((action) => (
                  <li
                    key={action.id}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{action.label}</span>
                      {action.when && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {action.when}
                        </span>
                      )}
                    </span>
                    <ShortcutKeys keys={action.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
