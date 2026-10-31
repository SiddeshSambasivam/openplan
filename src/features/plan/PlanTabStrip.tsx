import { ShortcutLabel } from "@/components/ShortcutKeys";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PLAN_TABS, type PlanTab } from "@/lib/planTab";
import { shortcut } from "@/lib/shortcuts";
import { WaitingBadge } from "./WaitingBadge";

/**
 * A plan's tabs, along the top of the plan area, each the strip's full
 * height. The open tab joins the page below it, with a rule along its top.
 * The Alignment tab counts the questions still waiting on the person. The
 * corners are square by Sid's choice, for this strip only.
 */
export function PlanTabStrip({
  tab,
  waiting,
  onChange,
}: {
  tab: PlanTab;
  waiting: number;
  onChange: (tab: PlanTab) => void;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onChange(value as PlanTab)}
      className="h-9 shrink-0 gap-0 border-b border-border"
    >
      {/* As tall as the strip with its rule, so the open tab hides the rule. */}
      <TabsList
        aria-label="Plan views"
        className="h-9 shrink-0 items-stretch gap-0 rounded-none bg-transparent p-0"
      >
        {PLAN_TABS.map((option) => (
          <Tooltip key={option.value}>
            <TooltipTrigger asChild>
              <TabsTrigger
                value={option.value}
                className="h-full flex-none rounded-none border-0 border-t-2 border-r border-t-transparent border-r-border bg-transparent px-4 text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-t-foreground data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none dark:text-muted-foreground dark:hover:text-foreground dark:data-[state=active]:border-t-foreground dark:data-[state=active]:border-r-border dark:data-[state=active]:bg-background"
              >
                {option.label}
                {option.value === "alignment" && waiting > 0 && <WaitingBadge count={waiting} />}
              </TabsTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              <ShortcutLabel label={option.label} keys={shortcut(KEY_TO[option.value]).keys} />
            </TooltipContent>
          </Tooltip>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** With two tabs, each key reaches one tab: left goes to Plan, right to Alignment. */
const KEY_TO = { plan: "previousTab", alignment: "nextTab" } as const satisfies Record<
  PlanTab,
  "previousTab" | "nextTab"
>;
