import { Folder, FolderGit2, GitBranch } from "lucide-react";
import { PrGlyph } from "@/components/PlanFacts";
import { Badge } from "@/components/ui/badge";
import { openExternal } from "@/lib/platform";
import { prBadges, prLabel, type Pr, type Repo } from "@/lib/work";
import { WorkHeading } from "./WorkHeading";

/** Where the work happens and what it has opened for review. PR state is
 * what the agent last reported. */
export function ReposAndPrs({ repos, prs }: { repos: Repo[]; prs: Pr[] }) {
  return (
    <section>
      <WorkHeading title="Repos and PRs" />
      <ul className="space-y-1.5">
        {repos.map((repo) => (
          <li key={repo.path} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {repo.remote ? (
              <FolderGit2 aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Folder aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <code title={repo.remote} className="font-mono text-xs break-all">
              {repo.path}
            </code>
            {repo.branch && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <GitBranch aria-hidden className="size-3" />
                {repo.branch}
              </span>
            )}
          </li>
        ))}
        {prs.map((pr) => (
          <li key={pr.url} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <PrGlyph state={pr.state} className="size-3.5" />
            <a
              href={pr.url}
              title={pr.url}
              onClick={(e) => {
                e.preventDefault();
                void openExternal(pr.url);
              }}
              className="text-primary underline-offset-4 hover:underline"
            >
              {prLabel(pr.url)}
            </a>
            {prBadges(pr).map((badge) => (
              <Badge key={badge.label} variant={badge.variant} className="font-normal">
                {badge.label}
              </Badge>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
