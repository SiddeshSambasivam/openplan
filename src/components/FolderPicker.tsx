import { Check, Plus } from "lucide-react";
import { useState, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { folderChoices, folderName, toggleFolder } from "@/lib/folders";
import { cn } from "@/lib/utils";

interface FolderPickerProps {
  /** The folders the plan is in. */
  folders: string[];
  /** Every folder in the base, to choose from. */
  known: string[];
  onChange: (folders: string[]) => void;
  /** The button that opens the picker. */
  trigger: ReactElement;
  /** Shown on hover, for a trigger that is only an icon. */
  tooltip?: ReactNode;
  /** Set where the folders key should open this picker. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/** Where the person puts a plan in folders and takes it out of them: the
 * folders the base already has, or a name typed for a new one. */
export function FolderPicker({
  folders,
  known,
  onChange,
  trigger,
  tooltip,
  open,
  onOpenChange,
}: FolderPickerProps) {
  const [typed, setTyped] = useState("");
  const { names, addable } = folderChoices(known, folders, typed);
  // The plan file cannot hold some characters in a folder name, so say so
  // while the name is being typed rather than after it changes.
  const loses = folderName(typed) !== typed.trim().replace(/\s+/g, " ");
  const toggle = (name: string) => {
    onChange(toggleFolder(folders, name, known));
    setTyped("");
  };

  const anchor = <PopoverTrigger asChild>{trigger}</PopoverTrigger>;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange?.(next);
      }}
    >
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>{anchor}</TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : (
        anchor
      )}
      <PopoverContent align="end" className="w-60 p-1">
        <Input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !folderName(typed)) return;
            e.preventDefault();
            toggle(typed);
          }}
          placeholder="Find or add a folder"
          aria-label="Folder name"
          className="h-8"
        />
        {loses && (
          <p className="px-2 pt-1.5 text-xs text-muted-foreground">
            Commas, brackets, quotes, colons and # are left out of folder names.
          </p>
        )}
        <div className="mt-1 flex max-h-56 flex-col overflow-y-auto">
          {names.map((name) => {
            const chosen = folders.some((f) => f.toLowerCase() === name.toLowerCase());
            return (
              <Button
                key={name}
                variant="ghost"
                size="sm"
                aria-pressed={chosen}
                onClick={() => toggle(name)}
                className="justify-start font-normal"
              >
                <Check className={cn("text-muted-foreground", !chosen && "opacity-0")} />
                <span className="truncate">{name}</span>
              </Button>
            );
          })}
          {addable && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggle(addable)}
              className="justify-start font-normal"
            >
              <Plus className="text-muted-foreground" />
              <span className="truncate">New folder: {addable}</span>
            </Button>
          )}
          {names.length === 0 && !addable && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              No folders yet. Type a name to add one.
            </p>
          )}
        </div>
        <p className="mt-1 border-t border-border px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
          A plan in a folder shows only when that folder is chosen.
        </p>
      </PopoverContent>
    </Popover>
  );
}
