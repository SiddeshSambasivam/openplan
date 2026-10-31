import { ArrowDown, ArrowUp, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TooltipButton } from "@/components/TooltipButton";
import {
  answeredCount,
  draftedAnswers,
  loadRailShown,
  loadReplyDrafts,
  newestWaiting,
  nextWaiting,
  saveRailShown,
  saveReplyDrafts,
  type ReplyDraft,
  type ReplyDrafts,
} from "@/lib/alignmentDrafts";
import { alignmentScore } from "@/lib/alignmentScore";
import { readPanel } from "@/lib/personRoles";
import { PLATFORM, shortcutFor, useShortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import {
  answerQuestions,
  DEFAULT_PANEL,
  persona,
  questionsByRound,
  railRoles,
  roundTitle,
  sendAnswers,
  unusedRoles,
  unusedRolesText,
  type Answer,
  type Question,
  type Role,
  type WorkRecord,
} from "@/lib/work";
import { AlignmentComposer, type ComposerLine } from "./AlignmentComposer";
import { AlignmentMessage, type MediaContext } from "./AlignmentMessage";
import { AlignmentScoreCard } from "./AlignmentScoreCard";
import { PersonaAvatar } from "./PersonaAvatar";
import { RoleHint } from "./RoleHint";
import { WaitingBadge } from "./WaitingBadge";
import { celebrate } from "./personaMotion";

/** What the plan page needs to write answers, render illustrations and
 * show the score against the target. */
export interface AlignmentContext extends MediaContext {
  path: string;
  id: string;
  /** The alignment target from settings. 0 means none. */
  alignmentTarget: number;
}

/** The last send: which questions went, and whether a session heard it. */
interface Sent {
  ids: string[];
  roles: Role[];
  reached: number;
}

type Tab = Role | "everyone";

/**
 * The questions agents posted on the plan, as a group chat with the personas
 * who asked them, oldest round first. Only the thread scrolls. A pick or
 * words from the composer is an answer, kept as a draft that survives a
 * reload until the person sends them together. `children` follow the
 * thread, inside its scroll.
 */
export function AlignmentQuestions({
  record,
  plan,
  children,
}: {
  record: WorkRecord | null;
  plan: AlignmentContext;
  children?: ReactNode;
}) {
  const [drafts, setDrafts] = useState<ReplyDrafts>(() => loadReplyDrafts(plan.id));
  const [tab, setTab] = useState<Tab>("everyone");
  const [railShown, setRailShown] = useState(loadRailShown);
  // The rail stays while it slides out, and the thread widens after.
  const [railLeaving, setRailLeaving] = useState(false);
  // The question the composer replies to. Unset follows the first waiting
  // one. Null means none after the last reply.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [line, setLine] = useState<ComposerLine | null>(null);
  // The record the write returned shows until the watcher reads it back.
  const [written, setWritten] = useState<{ from: WorkRecord | null; record: WorkRecord } | null>(
    null,
  );
  const [panel, setPanel] = useState(DEFAULT_PANEL);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const sendRef = useRef<HTMLButtonElement>(null);
  useEffect(() => void readPanel().then(setPanel), []);
  useEffect(() => saveReplyDrafts(plan.id, drafts), [plan.id, drafts]);
  useEffect(() => saveRailShown(railShown), [railShown]);
  const toggleRail = () => {
    setRailLeaving(railShown);
    setRailShown(!railShown);
  };
  useShortcuts({ peopleRail: toggleRail });

  const shown = written && written.from === record ? written.record : record;
  const questions = shown?.alignment?.questions ?? [];
  if (questions.length === 0) {
    return (
      <div className="alignment-thread min-h-0 flex-1 overflow-y-auto">
        <p className="mb-8 text-sm text-muted-foreground">No alignment yet.</p>
        <RoleHint />
        {children}
      </div>
    );
  }

  const answers = draftedAnswers(questions, drafts);
  const waiting = questions.filter((question) => !question.answer && !answers[question.id]);
  const ready = Object.keys(answers).length;
  const inTab = questions.filter((question) => tab === "everyone" || question.role === tab);
  // A question with a pick stays active, so words typed next become its note.
  const active =
    chosen === null
      ? undefined
      : (inTab.find((question) => question.id === chosen && !question.answer) ??
        nextWaiting(inTab, drafts));

  /** Writes the drafted answers and tells the agent. */
  const submit = async () => {
    if (busy) return;
    if (ready === 0) {
      setLine({ text: "Answer at least one question first." });
      return;
    }
    setBusy(true);
    setLine(null);
    setMissing(false);
    const sending = Object.entries(answers).map(([id, answer]) => ({ id, answer }));
    const result = await submitAnswers(plan, sending);
    setBusy(false);
    if (result.kind === "error") {
      setLine({ text: `Your answers were not saved. ${result.message}`, error: true });
      return;
    }
    const ids = Object.keys(answers);
    setWritten({ from: record, record: result.record });
    setDrafts((old) => withoutKeys(old, ids));
    setSent({ ids, roles: rolesOf(questions.filter((q) => answers[q.id])), reached: result.reached });
  };

  const edit = (id: string, change: Partial<ReplyDraft>) => {
    setMissing(false);
    setSent(null);
    setLine(null);
    setDrafts((old) => ({ ...old, [id]: { text: old[id]?.text ?? "", option: old[id]?.option, ...change } }));
  };

  const choose = (id: string) => {
    if (id === active?.id) return;
    setChosen(id);
    setMissing(false);
  };

  /** A pick is the answer, kept as a draft until the person sends it. */
  const pick = (question: Question, option: string) => {
    edit(question.id, { option });
    choose(question.id);
    if (!answers[question.id]) {
      cheerFor(question, questions, { ...answers, [question.id]: { kind: "option", options: [option] } });
    }
  };

  /** Moves on from an answered question to the next waiting one, so
   * replies flow from the keyboard. */
  const reply = () => {
    if (!active) return;
    if (!answers[active.id]) return setMissing(true);
    cheerFor(active, questions, answers);
    const after = nextWaiting(inTab, drafts, active.id);
    setChosen(after?.id ?? null);
    // With nothing left to reply to, the field goes, and Send is next.
    if (after) revealQuestion(after.id);
    else requestAnimationFrame(() => sendRef.current?.focus());
  };

  /** Drops the pick, so the words typed next are the answer itself. */
  const writeOwn = (question: Question) => {
    edit(question.id, { option: undefined });
    choose(question.id);
    requestAnimationFrame(() => fieldRef.current?.focus());
  };

  const change = (question: Question) => {
    setChosen(question.id);
    revealQuestion(question.id);
    requestAnimationFrame(() => fieldRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (shortcutFor(event, PLATFORM, false) !== "sendReview") return;
    event.preventDefault();
    void submit();
  };

  const latestRound = Math.max(...questions.map((question) => question.round ?? 1));
  const newest = newestWaiting(inTab, drafts);
  return (
    <section onKeyDown={onKeyDown} className="@container flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <ThreadHead
          tab={tab}
          railShown={railShown}
          waiting={waiting.length}
          onToggleRail={toggleRail}
        />
        <AlignmentScoreCard
          score={alignmentScore(questions, answers)}
          target={plan.alignmentTarget}
        />
      </div>
      <div className="flex min-h-0 flex-1 gap-3 @2xl:gap-5">
        {(railShown || railLeaving) && (
          <PeopleRail
            tab={tab}
            onTab={(next) => {
              setTab(next);
              setChosen(undefined);
            }}
            roles={railRoles(questions, panel)}
            waiting={waiting}
            leaving={!railShown}
            onLeft={() => setRailLeaving(false)}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <Thread latestId={newest?.id}>
            <RoleHint />
            {inTab.length === 0 && tab !== "everyone" && <Note>{unusedRolesText([tab])}</Note>}
            {questionsByRound(inTab).map((group) => (
              <div key={group.round} className="flex flex-col gap-4">
                <RoundDivider>{roundTitle(group.round, group.round === latestRound)}</RoundDivider>
                {tab === "everyone" && group.round === latestRound && (
                  <Note>{unusedRolesText(unusedRoles(group.questions, panel), "this round")}</Note>
                )}
                {group.questions.map((question) => (
                  <AlignmentMessage
                    key={question.id}
                    question={question}
                    draft={drafts[question.id]}
                    answer={answers[question.id]}
                    active={question.id === active?.id}
                    sent={sent?.ids.includes(question.id) ?? false}
                    onActivate={() => choose(question.id)}
                    onPick={(option) => pick(question, option)}
                    onWriteOwn={() => writeOwn(question)}
                    onChange={() => change(question)}
                    view={plan}
                  />
                ))}
              </div>
            ))}
            {sent && <SentLine sent={sent} />}
            {children}
          </Thread>
          <AlignmentComposer
            ref={fieldRef}
            sendRef={sendRef}
            question={active}
            text={active ? (drafts[active.id]?.text ?? "") : ""}
            missing={missing}
            line={line ?? { text: answeredCount(questions, drafts) }}
            ready={ready}
            busy={busy}
            hint={waiting.length > 0 ? "Pick a question in the thread to reply." : null}
            onText={(text) => active && edit(active.id, { text })}
            onReply={reply}
            onSend={() => void submit()}
          />
        </div>
      </div>
    </section>
  );
}

/** The thread's own scroll, with no bar. An arrow shows at whichever end
 * has more: down goes to the newest question still waiting, or the end,
 * and up goes back to the top. Two sentinels at the ends tell an observer
 * when either leaves the view, so nothing runs while the thread is still. */
function Thread({ latestId, children }: { latestId?: string; children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !topRef.current || !endRef.current) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setMore((old) => {
          const next = { ...old };
          for (const entry of entries) {
            if (entry.target === topRef.current) next.above = !entry.isIntersecting;
            else next.below = !entry.isIntersecting;
          }
          return next;
        }),
      { root },
    );
    observer.observe(topRef.current);
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, []);

  const goDown = () => {
    const root = scrollRef.current;
    if (!root) return;
    const latest = latestId ? root.querySelector(`[data-question="${CSS.escape(latestId)}"]`) : null;
    const top = latest ? offsetIn(root, latest) - 8 : null;
    root.scrollTo({
      top: top != null && top > root.scrollTop + 1 ? top : root.scrollHeight,
      behavior: scrollBehavior(),
    });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        tabIndex={0}
        role="region"
        aria-label="Questions"
        className="alignment-thread min-h-0 flex-1 overflow-y-auto rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <div ref={topRef} className="h-px" aria-hidden />
        <div className="flex flex-col gap-4 pb-2">{children}</div>
        <div ref={endRef} className="h-px" aria-hidden />
      </div>
      <ScrollArrow
        direction="up"
        shown={more.above}
        onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: scrollBehavior() })}
      />
      <ScrollArrow direction="down" shown={more.below} onClick={goDown} />
    </div>
  );
}

function ScrollArrow({
  direction,
  shown,
  onClick,
}: {
  direction: "up" | "down";
  shown: boolean;
  onClick: () => void;
}) {
  const up = direction === "up";
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 flex justify-center",
        up ? "top-1" : "bottom-1",
      )}
    >
      <TooltipButton
        variant="outline"
        size="icon-xs"
        tooltip={up ? "Back to the top" : "Go to the latest question"}
        tooltipSide={up ? "bottom" : "top"}
        aria-label={up ? "Back to the top" : "Go to the latest question"}
        inert={!shown}
        onClick={onClick}
        className={cn(
          "rounded-full shadow-sm transition-[opacity,scale,translate] duration-150 ease-out dark:bg-background dark:hover:bg-accent",
          shown
            ? "pointer-events-auto opacity-100"
            : cn("scale-90 opacity-0", up ? "-translate-y-1" : "translate-y-1"),
        )}
      >
        {up ? <ArrowUp /> : <ArrowDown />}
      </TooltipButton>
    </div>
  );
}

/** Everyone, then one tab per role with the questions still waiting on
 * the person, in a column on the left. Narrow, each tab drops its title.
 * It slides in from the left, and out again before it unmounts. */
export function PeopleRail({
  tab,
  onTab,
  roles,
  waiting,
  leaving,
  onLeft,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  roles: Role[];
  waiting: Question[];
  leaving: boolean;
  onLeft: () => void;
}) {
  const tabs: { id: Tab; name: string; title: string }[] = [
    { id: "everyone", name: "Everyone", title: "Group thread" },
    ...roles.map((role) => ({ id: role, ...persona(role) })),
  ];
  return (
    <nav
      inert={leaving}
      onAnimationEnd={(event) => leaving && event.target === event.currentTarget && onLeft()}
      className={cn(
        "flex w-36 shrink-0 flex-col overflow-y-auto duration-200 ease-out @2xl:w-52",
        leaving
          ? "animate-out fill-mode-forwards fade-out-0 slide-out-to-left-8"
          : "animate-in fade-in-0 slide-in-from-left-8",
      )}
    >
      <div role="tablist" aria-label="People asking" aria-orientation="vertical" className="flex flex-col gap-1">
        {tabs.map((item) => {
          const count = waiting.filter((q) => item.id === "everyone" || q.role === item.id).length;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => onTab(item.id)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted aria-selected:bg-muted"
            >
              {item.id === "everyone" ? (
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Users className="size-3.5" />
                </span>
              ) : (
                <PersonaAvatar role={item.id} className="text-2xl" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="hidden text-xs text-muted-foreground @2xl:block">{item.title}</span>
              </span>
              {count > 0 && <WaitingBadge count={count} />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** The rail's toggle, above where the rail opens, then the name of the
 * view. A hidden rail still says how many questions wait, so none is
 * missed. */
function ThreadHead({
  tab,
  railShown,
  waiting,
  onToggleRail,
}: {
  tab: Tab;
  railShown: boolean;
  waiting: number;
  onToggleRail: () => void;
}) {
  const asker = tab === "everyone" ? null : persona(tab);
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <TooltipButton
        variant="ghost"
        size="sm"
        shortcut="peopleRail"
        tooltip={railShown ? "Hide the people" : "Show the people"}
        tooltipAlign="start"
        aria-label={railShown ? "Hide the people" : "Show the people"}
        aria-pressed={railShown}
        onClick={onToggleRail}
        className="-ml-2 gap-1.5 px-2 text-muted-foreground"
      >
        {railShown ? <PanelLeftClose /> : <PanelLeftOpen />}
        {!railShown && waiting > 0 && <WaitingBadge count={waiting} />}
      </TooltipButton>
      <h2 className="truncate text-sm font-medium text-foreground">
        {asker ? [asker.name, asker.title.toLowerCase()].filter(Boolean).join(", ") : "Everyone"}
      </h2>
    </div>
  );
}

function RoundDivider({ children }: { children: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 text-xs text-muted-foreground before:h-px before:w-8 before:bg-border after:h-px after:w-8 after:bg-border">
      {children}
    </div>
  );
}

function Note({ children }: { children: string | null }) {
  if (!children) return null;
  return <p className="text-center text-xs text-muted-foreground">{children}</p>;
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
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <PersonaAvatar role={reader} typing className="text-xl" />
        <span>{persona(reader).name} is reading your answers</span>
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

/** Brings the next question to the top of the thread once it has rendered
 * as active. Only the thread moves, never the page around it. */
function revealQuestion(id: string) {
  requestAnimationFrame(() => {
    const question = document.querySelector(`[data-question="${CSS.escape(id)}"]`);
    const thread = question?.closest<HTMLElement>(".alignment-thread");
    if (!question || !thread) return;
    thread.scrollTo({ top: offsetIn(thread, question) - 8, behavior: scrollBehavior() });
  });
}

function scrollBehavior(): ScrollBehavior {
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/** How far down its scroll an element sits, whatever lies between. */
function offsetIn(root: HTMLElement, element: Element): number {
  return element.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
}

function rolesOf(questions: Question[]): Role[] {
  return railRoles(questions, []);
}

function withoutKeys<T>(record: Record<string, T>, keys: string[]): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
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
