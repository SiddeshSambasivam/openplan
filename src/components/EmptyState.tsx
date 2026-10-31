import { FileText } from "lucide-react";
import { isMac } from "../lib/platform";
import { Button } from "./Button";

export function EmptyState({
  onOpenFileDialog,
  onOpenFolderDialog,
}: {
  onOpenFileDialog: () => void;
  onOpenFolderDialog: () => void;
}) {
  return (
    <div className="animate-fade-in flex h-full items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border px-8 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted">
          <FileText className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">No document open</p>
          <p className="text-xs leading-5 text-muted-foreground">
            Drag Markdown files — or whole folders — anywhere in
            <br />
            this window, or open them from your computer.
          </p>
        </div>
        <div className="flex items-center gap-2.5 pt-1">
          <Button onClick={onOpenFileDialog} tooltip={isMac ? "⌘O" : "Ctrl+O"}>
            Open file
          </Button>
          <Button
            variant="outline"
            onClick={onOpenFolderDialog}
            tooltip={isMac ? "⇧⌘O" : "Ctrl+Shift+O"}
          >
            Open folder
          </Button>
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">
            {isMac ? "⌘O" : "Ctrl+O"}
          </kbd>
        </div>
      </div>
    </div>
  );
}
