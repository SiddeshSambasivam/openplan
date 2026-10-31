import { defaultFilter } from "cmdk";
import type { PlanSummary } from "./planBase";

/**
 * The plans whose titles match the query, best first, scored the way the
 * palette scores everything else. The palette mounts only these, so a base
 * of hundreds of plans opens it as fast as a base of ten.
 */
export function matchPlans(plans: PlanSummary[], query: string, limit: number): PlanSummary[] {
  const search = query.trim();
  if (!search) return [];
  return plans
    .map((plan) => ({ plan, score: defaultFilter(plan.title, search) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((match) => match.plan);
}
