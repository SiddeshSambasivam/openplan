import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";

/** The card both pickers draw. Checked comes from `aria-checked`, which the
 * radio and the checkbox each set. */
export const choiceCard =
  "relative rounded-lg border bg-card/80 p-3.5 text-left outline-none transition-transform hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-98 aria-checked:border-foreground/45 aria-checked:bg-accent disabled:pointer-events-none disabled:opacity-45 short:px-3 short:py-2.5";

/**
 * What a choice card holds: its picture, its name, one line under it, and in
 * the corner the key that picks it, which turns into a tick once picked.
 */
export function ChoiceCardBody({
  picture,
  label,
  hint,
  keyHint,
  checked,
}: {
  picture?: ReactNode;
  label: string;
  hint?: string;
  keyHint?: string;
  checked: boolean;
}) {
  return (
    <>
      {picture}
      <span className="block text-sm font-medium">{label}</span>
      {hint && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{hint}</span>}
      {keyHint && (
        <Kbd className={cn("absolute top-3 right-3 transition-opacity", checked && "opacity-0")}>
          {keyHint}
        </Kbd>
      )}
      <span
        aria-hidden
        className={cn(
          "absolute top-3 right-3 grid size-5 place-items-center rounded-full bg-foreground text-background transition-[opacity,transform] duration-300",
          checked ? "scale-100 opacity-100" : "scale-60 opacity-0",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </>
  );
}
