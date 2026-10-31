import { useEffect, useState, type KeyboardEvent } from "react";
import { ShortcutLabel } from "@/components/ShortcutKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  loadReplyDrafts,
  repliedAnswers,
  saveReplyDrafts,
  type ReplyDraft,
  type ReplyDrafts,
} from "@/lib/alignmentDrafts";
import { alignmentScore, sendBarBuild } from "@/lib/alignmentScore";
import { keysLabel, PLATFORM, shortcut } from "@/lib/shortcuts";
import {
  answerQuestions,
  PERSONAS,
  questionsByRound,
  ROLES,
  roundTitle,
  sendAnswers,
  spokenList,
  unusedRoles,
  unusedRolesText,
  type Answer,
  type Question,
  type Role,
  type WorkRecord,
} from "@/lib/work";
import { AlignmentMessage, type MediaContext } from "./AlignmentMessage";
import { AlignmentScoreCard } from "./AlignmentScoreCard";
import { PersonaAvatar } from "./PersonaAvatar";
import { celebrate } from "./personaMotion";

/** The registry gives this key to Send review, so the tab takes it itself
 * while focus is inside it. */
const SUBMIT_KEYS = shortcut("sendReview").keys;

/** What the plan page needs to write answers and render illustrations. */
export interface AlignmentContext extends MediaContext {
  path: string;
  id: string;
}

/** The last send: which questions went, and whether a session heard it. */
interface Sent {
  ids: string[];
  roles: Role[];
  reached: number;
}

/** What the send bar says in place of its count, after an action. */
interface BarLine {
  text: string;
  error?: boolean;
}

type Tab = Role | "everyone";

/**
 * The questions agents posted on the plan, as a group chat with the personas
 * who asked them, oldest round first. Replies wait as drafts, which survive
 * a reload, until the person sends them together.
 */
export function AlignmentQuestions({
  record,
  plan,
  onBuild,
}: {
  record: WorkRecord | null;
  plan: AlignmentContext;
  /** Starts the work, as the top bar's Build does. None once it started. */
  onBuild?: () => void;
}) {
  const [drafts, setDrafts] = useState<ReplyDrafts>(() => loadReplyDrafts(plan.id));
  const [tab, setTab] = useState<Tab>("everyone");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [line, setLine] = useState<BarLine | null>(null);
  // The record the write returned shows until the watcher reads it back.
  const [written, setWritten] = useState<{ from: WorkRecord | null; record: WorkRecord } | null>(
    null,
  );
  useEffect(() => saveReplyDrafts(plan.id, drafts), [plan.id, drafts]);

  const shown = written && written.from === record ? written.record : record;
  const questions = shown?.alignment?.questions ?? [];
  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">No alignment yet.</p>;
  }

  const answers = repliedAnswers(questions, drafts);
  const score = alignmentScore(questions, answers);
  const waiting = questions.filter((question) => !question.answer && !answers[question.id]);
  const ready = Object.keys(answers).length;
  const build = sendBarBuild(score);

  /** Writes the replies ready to send and tells the agent. True once they
   * are written. */
  const submit = async (): Promise<boolean> => {
    if (busy) return false;
    if (ready === 0) {
      setLine({ text: "Reply to at least one question first." });
      return false;
    }
    setBusy(true);
    setLine(null);
    const sending = Object.entries(answers).map(([id, answer]) => ({ id, answer }));
    const result = await submitAnswers(plan, sending);
    setBusy(false);
    if (result.kind === "error") {
      setLine({ text: `Your answers were not saved. ${result.message}`, error: true });
      return false;
    }
    const ids = Object.keys(answers);
    setWritten({ from: record, record: result.record });
    setDrafts((old) => withoutKeys(old, ids));
    setSent({ ids, roles: rolesOf(questions.filter((q) => answers[q.id])), reached: result.reached });
    return true;
  };

  const startBuild = async () => {
    if (!onBuild || busy) return;
    if (ready > 0 && !(await submit())) return;
    onBuild();
    setLine({ text: build.sent });
  };

  const reply = (question: Question) => {
    const draft = drafts[question.id] ?? { text: "" };
    const next = { ...drafts, [question.id]: { ...draft, replied: true } };
    setDrafts(next);
    setSent(null);
    setLine(null);
    cheerFor(question, questions, repliedAnswers(questions, next));
    const after = waiting.find(
      (other) => other.id !== question.id && (tab === "everyone" || other.role === tab),
    );
    if (after) focusQuestion(after.id);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" || !modHeld(event)) return;
    event.preventDefault();
    void submit();
  };

  const latestRound = Math.max(...questions.map((question) => question.round ?? 1));
  const inTab = questions.filter((question) => tab === "everyone" || question.role === tab);
  return (
    <section onKeyDown={onKeyDown} className="@container">
      <div className="flex flex-col gap-5 @2xl:flex-row">
        <PeopleRail tab={tab} onTab={setTab} waiting={waiting} />
        <div className="flex min-w-0 flex-1 flex-col gap-4.5">
          <ThreadHead tab={tab} />
          <AlignmentScoreCard score={score} />
          {inTab.length === 0 && tab !== "everyone" && <Note>{unusedRolesText([tab])}</Note>}
          {questionsByRound(inTab).map((group) => (
            <div key={group.round} className="flex flex-col gap-4.5">
              <RoundDivider>{roundTitle(group.round, group.round === latestRound)}</RoundDivider>
              {tab === "everyone" && group.round === latestRound && (
                <Note>{unusedRolesText(unusedRoles(group.questions), "this round")}</Note>
              )}
              {group.questions.map((question) => (
                <AlignmentMessage
                  key={question.id}
                  question={question}
                  draft={drafts[question.id]}
                  answer={answers[question.id]}
                  sent={sent?.ids.includes(question.id) ?? false}
                  onDraft={(draft: ReplyDraft) => setDrafts((old) => ({ ...old, [question.id]: draft }))}
                  onReply={() => reply(question)}
                  onChange={() =>
                    setDrafts((old) => ({ ...old, [question.id]: { ...old[question.id], replied: false } }))
                  }
                  view={plan}
                />
              ))}
            </div>
          ))}
          {sent && <SentLine sent={sent} />}
          {(waiting.length + ready > 0 || sent || line || onBuild) && (
            <SendBar
              line={line ?? { text: barSummary(sent, ready, waiting.length) }}
              ready={ready}
              canSend={waiting.length + ready > 0}
              busy={busy}
              buildTooltip={build.tooltip}
              onSend={() => void submit()}
              onBuild={onBuild && (() => void startBuild())}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Everyone, then one tab per persona with the questions still waiting on
 * the person. Narrow, the rail becomes a row of chips. */
function PeopleRail({
  tab,
  onTab,
  waiting,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  waiting: Question[];
}) {
  const tabs: { id: Tab; name: string; title: string }[] = [
    { id: "everyone", name: "Everyone", title: "Group thread" },
    ...ROLES.map((role) => ({ id: role, ...PERSONAS[role] })),
  ];
  return (
    <nav className="flex shrink-0 flex-col @2xl:sticky @2xl:top-4 @2xl:w-58 @2xl:self-start">
      <p className="mb-2 hidden text-sm font-medium text-muted-foreground @2xl:block">
        Talking about this plan
      </p>
      <div role="tablist" aria-label="People asking" className="flex gap-1 overflow-x-auto pb-1 @2xl:flex-col @2xl:pb-0">
        {tabs.map((item) => {
          const count = waiting.filter((q) => item.id === "everyone" || q.role === item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => onTab(item.id)}
              className="flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted aria-selected:bg-muted @2xl:w-full"
            >
              {item.id === "everyone" ? <GroupIcon /> : <PersonaAvatar role={item.id} className="text-3xl" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="hidden text-xs text-muted-foreground @2xl:block">{item.title}</span>
              </span>
              {count > 0 && (
                <Badge
                  className="h-5 min-w-5 rounded-full px-1.5 py-0 font-semibold tabular-nums"
                  aria-label={`${count} waiting`}
                >
                  {count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function GroupIcon() {
  return (
    <span className="grid size-8 shrink-0 grid-cols-2 gap-px">
      {ROLES.map((role) => (
        <PersonaAvatar key={role} role={role} className="text-base" />
      ))}
    </span>
  );
}

function ThreadHead({ tab }: { tab: Tab }) {
  const persona = tab === "everyone" ? null : PERSONAS[tab];
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3.5">
      <div>
        <p className="text-xs tracking-wide text-muted-foreground">Alignment</p>
        <h2 className="text-lg font-semibold text-balance text-foreground">
          {persona ? `${persona.name}, ${persona.title.toLowerCase()}` : "Everyone"}
        </h2>
      </div>
      <div className="flex items-center pl-1.5" aria-hidden>
        {(tab === "everyone" ? ROLES : [tab]).map((role) => (
          <PersonaAvatar key={role} role={role} className="-ml-1.5 text-3xl" />
        ))}
      </div>
    </div>
  );
}

function RoundDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      {children}
    </div>
  );
}

function Note({ children }: { children: string | null }) {
  if (!children) return null;
  return <p className="text-center text-xs text-muted-foreground">{children}</p>;
}

/** Pinned under the thread: how many replies are ready, Build, and the
 * send. Build goes left of Send, so Send stays the primary action. */
function SendBar({
  line,
  ready,
  canSend,
  busy,
  buildTooltip,
  onSend,
  onBuild,
}: {
  line: BarLine;
  ready: number;
  canSend: boolean;
  busy: boolean;
  buildTooltip: string;
  onSend: () => void;
  onBuild?: () => void;
}) {
  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-[color-mix(in_oklch,var(--muted)_50%,var(--background))] py-2.5 pr-3 pl-3.5">
      <p
        role={line.error ? "alert" : "status"}
        className={line.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
      >
        {line.text}
      </p>
      <div className="flex flex-wrap gap-2">
        {onBuild && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" disabled={busy} onClick={onBuild}>
                Build
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>
              <ShortcutLabel label={buildTooltip} keys={shortcut("build").keys} />
            </TooltipContent>
          </Tooltip>
        )}
        {canSend && (
          <Button disabled={busy} onClick={onSend}>
            {busy ? "Sending..." : `Send ${ready === 0 ? "answers" : answerCount(ready)}`}
            <Kbd className="h-4.5 min-w-0 rounded-sm border border-primary-foreground/25 bg-transparent text-primary-foreground/80">
              {keysLabel(SUBMIT_KEYS, PLATFORM)}
            </Kbd>
          </Button>
        )}
      </div>
    </div>
  );
}

/** Under the thread after a send. When a session heard it, the first
 * persona who asked reads along. */
function SentLine({ sent }: { sent: Sent }) {
  const reader = sent.roles[0];
  if (sent.reached === 0 || !reader) {
    return <Note>Sent. The agent will see your answers on its next message.</Note>;
  }
  return (
    <>
      <Note>Sent. The agent has your answers.</Note>
      <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <PersonaAvatar role={reader} typing className="text-2xl" />
        <span>{PERSONAS[reader].name} is reading your answers</span>
        <span className="typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </p>
    </>
  );
}

/** One persona hops once all of its questions have a reply, and every
 * persona once the plan is fully aligned. */
function cheerFor(question: Question, questions: Question[], answers: Record<string, Answer>) {
  if (alignmentScore(questions, answers).total === 100) return celebrate();
  const role = question.role;
  if (role && questions.every((q) => q.role !== role || q.answer || answers[q.id])) celebrate(role);
}

/** Moves to the next question waiting in view, so replies flow from the
 * keyboard. */
function focusQuestion(id: string) {
  requestAnimationFrame(() => {
    const message = document.querySelector(`[data-question="${CSS.escape(id)}"]`);
    message?.querySelector<HTMLElement>('[role="radio"], textarea')?.focus();
  });
}

/** The send bar's count, or once everything went out, who has it. */
function barSummary(sent: Sent | null, ready: number, waiting: number): string {
  if (sent && ready + waiting === 0) {
    if (sent.roles.length === 0) return "The agent has what it asked for.";
    const names = spokenList(sent.roles.map((role) => PERSONAS[role].name));
    return `${names} ${sent.roles.length === 1 ? "has" : "have"} what they asked for.`;
  }
  if (ready === 0) return "Answer the waiting questions. They reach the agent together, so it wakes once.";
  return `${answerCount(ready)} ready.${waiting > 0 ? ` ${waiting} still waiting.` : ""}`;
}

function rolesOf(questions: Question[]): Role[] {
  return ROLES.filter((role) => questions.some((question) => question.role === role));
}

function withoutKeys<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}

function answerCount(count: number): string {
  return `${count} ${count === 1 ? "answer" : "answers"}`;
}

function modHeld(event: KeyboardEvent): boolean {
  return PLATFORM === "mac" ? event.metaKey : event.ctrlKey;
}

/** Writes the answers, then tells the agent. A failed write comes back in
 * the person's words. A failed tell only means no session heard it now:
 * the agent reads the record on its next message. */
async function submitAnswers(
  plan: AlignmentContext,
  answers: { id: string; answer: Answer }[],
): Promise<{ kind: "sent"; reached: number; record: WorkRecord } | { kind: "error"; message: string }> {
  let record: WorkRecord;
  try {
    record = await answerQuestions(plan.path, answers);
  } catch (error) {
    return { kind: "error", message: errorText(error) };
  }
  const reached = await sendAnswers(plan.id).catch(() => 0);
  return { kind: "sent", reached, record };
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.trim() || "Try again.";
}
