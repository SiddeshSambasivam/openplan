import type { ReactNode } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { formatKeys, PLATFORM } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** A key in the registry's notation, one `kbd` per part. */
export function ShortcutKeys({ keys, className }: { keys: string; className?: string }) {
  return (
    <KbdGroup className={className}>
      {formatKeys(keys, PLATFORM).map((part, index) => (
        <Kbd key={index}>{part}</Kbd>
      ))}
    </KbdGroup>
  );
}

/** A tooltip's text: what the control does, then its key when it has one. */
export function ShortcutLabel({
  label,
  keys,
  className,
}: {
  label: ReactNode;
  keys?: string;
  className?: string;
}) {
  if (!keys) return <>{label}</>;
  return (
    <span className={cn("flex items-center gap-2", className)}>
      {label}
      <ShortcutKeys keys={keys} />
    </span>
  );
}
