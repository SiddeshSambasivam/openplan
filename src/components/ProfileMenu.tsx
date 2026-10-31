import { ChevronUp } from "lucide-react";
import type { Identity } from "@/lib/comments";
import { shortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProfileAvatar } from "./ProfileAvatar";
import { Segmented } from "./Segmented";
import { ShortcutKeys } from "./ShortcutKeys";

type Theme = "light" | "dark";

const THEMES: { value: Theme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

interface ProfileMenuProps {
  /** Null in the browser build, which has no settings to read it from. */
  identity: Identity | null;
  /** Shows the avatar alone, with the name in a tooltip. */
  minimized: boolean;
  dark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
}

/** The person at the foot of the navbar, and the menu of things that are
 * theirs: settings, the theme and the keys. */
export function ProfileMenu({ identity, minimized, ...items }: ProfileMenuProps) {
  const name = displayName(identity);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              aria-label={minimized ? name : undefined}
              className="flex w-full cursor-pointer items-center gap-2 overflow-hidden rounded-md px-1 py-1 text-left text-sm text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[state=open]:bg-sidebar-accent/60"
            >
              <ProfileAvatar seed={avatarSeed(identity)} className="size-6" />
              <span
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 transition-opacity duration-180 ease-out",
                  minimized && "opacity-0",
                )}
              >
                <span className="flex-1 truncate">{name}</span>
                <ChevronUp strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground" />
              </span>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {minimized && (
          <TooltipContent side="right" sideOffset={6}>
            {name}
          </TooltipContent>
        )}
      </Tooltip>
      <DropdownMenuContent side="top" align="start" className="w-64 rounded-lg">
        <ProfileMenuItems identity={identity} {...items} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu's rows, apart from its trigger and popover. */
export function ProfileMenuItems({
  identity,
  dark,
  onToggleTheme,
  onOpenSettings,
  onOpenShortcuts,
}: Omit<ProfileMenuProps, "minimized">) {
  return (
    <>
      <DropdownMenuLabel className="flex items-center gap-3 font-normal">
        <ProfileAvatar seed={avatarSeed(identity)} className="size-10" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{displayName(identity)}</span>
          {identity?.email && (
            <span className="truncate text-xs text-muted-foreground">{identity.email}</span>
          )}
        </span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onOpenSettings}>
        Settings
        <DropdownMenuShortcut className="tracking-normal">
          <ShortcutKeys keys={shortcut("settings").keys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <div className="flex items-center gap-2 px-2 py-1 text-sm">
        Theme
        <ShortcutKeys keys={shortcut("theme").keys} />
        <Segmented
          value={dark ? "dark" : "light"}
          options={THEMES}
          onChange={(theme) => {
            if ((theme === "dark") !== dark) onToggleTheme();
          }}
          className="ml-auto"
        />
      </div>
      <DropdownMenuItem onSelect={onOpenShortcuts}>
        Keyboard shortcuts
        <DropdownMenuShortcut className="tracking-normal">
          <ShortcutKeys keys={shortcut("shortcuts").keys} />
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  );
}

function displayName(identity: Identity | null): string {
  return identity?.name.trim() || identity?.email || "You";
}

function avatarSeed(identity: Identity | null): string {
  return identity?.email || identity?.name || "";
}
