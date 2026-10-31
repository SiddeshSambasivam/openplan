import { Check } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { ShortcutLabel } from "@/components/ShortcutKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  loadReplyDrafts,
  repliedAnswers,
  saveReplyDrafts,
  type ReplyDraft,
  type ReplyDrafts,
} from "@/lib/alignmentDrafts";
import { alignmentScore } from "@/lib/alignmentScore";
import { PLATFORM } from "@/lib/shortcuts";
import {
  answerQuestions,
  PERSONAS,
  questionsByRound,
  ROLES,
  sendAnswers,
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

/** The registry gives mod+enter to Send review, so the tab takes the key
 * itself while focus is inside it. */
const SUBMIT_KEYS = "mod+enter";

/** What the plan page needs to write answers and render illustrations. */
export interface AlignmentContext extends MediaContext {
  path: string;
  id: string;
}

type Notice =
  | { kind: "sent"; reached: number; roles: Role[] }
  | { kind: "error"; message: string };

type Tab = Role | "everyone";

/**
 * The questions agents posted on the plan, as a group chat with the personas
 * who asked them, oldest round first. Replies wait as drafts, which survive
 * a reload, until the person sends them together.
 */
export function AlignmentQuestions({
  record,
  plan,
}: {
  record: WorkRecord | null;
  plan: AlignmentContext;
}) {
  const [drafts, setDrafts] = useState<ReplyDrafts>(() => loadReplyDrafts(plan.id));
  const [tab, setTab] = useState<Tab>("everyone");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
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

  const submit = async () => {
    if (busy || ready === 0) return;
    setBusy(true);
    setNotice(null);
    const sent = Object.entries(answers).map(([id, answer]) => ({ id, answer }));
    const result = await submitAnswers(plan, sent);
    if (result.kind === "sent") {
      setWritten({ from: record, record: result.record });
      setDrafts((old) => withoutKeys(old, Object.keys(answers)));
      setNotice({ ...result, roles: rolesOf(questions.filter((q) => answers[q.id])) });
    } else {
      setNotice(result);
    }
    setBusy(false);
  };

  const reply = (question: Question) => {
    const draft = drafts[question.id] ?? { text: "" };
    const next = { ...drafts, [question.id]: { ...draft, replied: true } };
    setDrafts(next);
    setNotice(null);
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

  const inTab = questions.filter((question) => tab === "everyone" || question.role === tab);
  return (
    <section onKeyDown={onKeyDown} className="@container">
      <div className="flex flex-col gap-5 @2xl:flex-row">
        <PeopleRail tab={tab} onTab={setTab} waiting={waiting} />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <ThreadHead tab={tab} />
          <AlignmentScoreCard score={score} />
          {inTab.length === 0 && tab !== "everyone" && (
            <Note>{unusedRolesText([tab])}</Note>
          )}
          {questionsByRound(inTab).map((group) => (
            <div key={group.round} className="flex flex-col gap-4">
              <RoundDivider round={group.round} />
              {tab === "everyone" && <Note>{unusedRolesText(unusedRoles(group.questions), "this round")}</Note>}
              {group.questions.map((question) => (
                <AlignmentMessage
                  key={question.id}
                  question={question}
                  draft={drafts[question.id]}
                  answer={answers[question.id]}
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
          {waiting.length + ready > 0 ? (
            <SendBar ready={ready} waiting={waiting.length} busy={busy} notice={notice} onSend={submit} />
          ) : (
            notice && <NoticeLine notice={notice} />
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
    <nav className="flex shrink-0 flex-col gap-1 @2xl:sticky @2xl:top-4 @2xl:w-52 @2xl:self-start">
      <p className="mb-1 hidden text-xs font-medium text-muted-foreground @2xl:block">
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
              className="flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted aria-selected:bg-muted @2xl:w-full"
            >
              {item.id === "everyone" ? <GroupIcon /> : <PersonaAvatar role={item.id} className="text-3xl" />}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="hidden text-xs text-muted-foreground @2xl:block">{item.title}</span>
              </span>
              {count > 0 && (
                <Badge className="min-w-5 rounded-full px-1.5 tabular-nums" aria-label={`${count} waiting`}>
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
    <span className="grid size-8 shrink-0 grid-cols-2 place-items-center">
      {ROLES.map((role) => (
        <PersonaAvatar key={role} role={role} className="text-sm" />
      ))}
    </span>
  );
}

function ThreadHead({ tab }: { tab: Tab }) {
  const persona = tab === "everyone" ? null : PERSONAS[tab];
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
      <h2 className="text-base font-semibold text-balance text-foreground">
        {persona ? `${persona.name}, ${persona.title.toLowerCase()}` : "Everyone"}
      </h2>
      <div className="flex items-center pl-1.5" aria-hidden>
        {(tab === "everyone" ? ROLES : [tab]).map((role) => (
          <PersonaAvatar key={role} role={role} className="-ml-1.5 text-2xl" />
        ))}
      </div>
    </div>
  );
}

function RoundDivider({ round }: { round: number }) {
  return (
    <div className="flex items-center gap-2.5 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
      Round {round}
    </div>
  );
}

function Note({ children }: { children: string | null }) {
  if (!children) return null;
  return <p className="text-center text-xs text-muted-foreground">{children}</p>;
}

/** Pinned under the thread: how many replies are ready, and the send. */
function SendBar({
  ready,
  waiting,
  busy,
  notice,
  onSend,
}: {
  ready: number;
  waiting: number;
  busy: boolean;
  notice: Notice | null;
  onSend: () => void;
}) {
  const summary =
    ready === 0
      ? "Answer the waiting questions. They reach the agent together, so it wakes once."
      : `${answerCount(ready)} ready.${waiting > 0 ? ` ${waiting} still waiting.` : ""}`;
  return (
    <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-lg border border-border bg-card py-2.5 pr-3 pl-3.5">
      <div className="min-w-0 flex-1">
        {notice ? <NoticeLine notice={notice} /> : <p className="text-sm text-muted-foreground">{summary}</p>}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="sm" disabled={busy || ready === 0} onClick={onSend} className="shrink-0">
            {busy ? "Sending..." : `Send ${ready === 0 ? "answers" : answerCount(ready)}`}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <ShortcutLabel label="Send your answers to the agent" keys={SUBMIT_KEYS} />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** What came of a send. When a session heard it, the personas who asked
 * read along. */
function NoticeLine({ notice }: { notice: Notice }) {
  if (notice.kind === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        Your answers were not saved. {notice.message}
      </p>
    );
  }
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      {notice.reached > 0 && notice.roles.length > 0 ? (
        <span className="flex items-center gap-0.5" aria-hidden>
          {notice.roles.map((role) => (
            <PersonaAvatar key={role} role={role} typing className="text-xl" />
          ))}
        </span>
      ) : (
        <Check className="size-3.5 shrink-0" />
      )}
      {notice.reached > 0
        ? "The agent has your answers."
        : "The agent will see your answers on its next message."}
    </p>
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
): Promise<{ kind: "sent"; reached: number; record: WorkRecord } | Extract<Notice, { kind: "error" }>> {
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
