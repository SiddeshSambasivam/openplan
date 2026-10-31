import { FileDown } from "lucide-react";

export function DropOverlay() {
  return (
    <div className="animate-in fade-in duration-150 pointer-events-none fixed inset-0 z-50 bg-background/70 p-3 backdrop-blur-[2px]">
      <div className="flex h-full w-full items-center justify-center rounded-xl border-2 border-dashed border-ring bg-background/50">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted">
            <FileDown className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Drop to open</p>
          <p className="text-xs text-muted-foreground">
            Markdown files and folders will be added to your sidebar
          </p>
        </div>
      </div>
    </div>
  );
}
