export type PlanTab = "plan" | "alignment";

export const PLAN_TABS: { value: PlanTab; label: string }[] = [
  { value: "plan", label: "Plan" },
  { value: "alignment", label: "Alignment" },
];

/** The tab each plan was left on, by path. Kept for the session only. */
export type PlanTabs = Readonly<Record<string, PlanTab>>;

export function tabFor(tabs: PlanTabs, path: string | null): PlanTab {
  return (path != null && tabs[path]) || "plan";
}

export function withTab(tabs: PlanTabs, path: string, tab: PlanTab): PlanTabs {
  return { ...tabs, [path]: tab };
}

/** The tab `by` steps away, wrapping at the ends like browser tabs. */
export function stepTab(tab: PlanTab, by: 1 | -1): PlanTab {
  const at = PLAN_TABS.findIndex((each) => each.value === tab);
  return PLAN_TABS[(at + by + PLAN_TABS.length) % PLAN_TABS.length].value;
}
