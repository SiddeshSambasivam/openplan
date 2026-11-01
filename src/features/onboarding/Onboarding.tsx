import { ChevronLeft, LoaderCircle } from "lucide-react";
import { useEffect, useReducer, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Progress } from "@/components/ui/progress";
import {
  canContinue,
  detectAgents,
  finishOnboarding,
  installTools,
  litBars,
  onboardingKey,
  startOnboarding,
  step,
  type InstallStep,
  type OnboardingEvent,
  type OnboardingResult,
  type OnboardingStep,
} from "@/lib/onboarding";
import { markStart } from "@/lib/navbar";
import { cn } from "@/lib/utils";
import { AgentPicker } from "./AgentPicker";
import { AgentSetup } from "./AgentSetup";
import { OnboardingBackdrop } from "./OnboardingBackdrop";
import { PanelPreview } from "./PanelPreview";
import { RolePicker } from "./RolePicker";

/** How long a screen takes to fade out before the next one rises. */
const LEAVE_MS = 160;

const RISE = "animate-in fade-in slide-in-from-bottom-3 duration-600 fill-mode-backwards";

interface OnboardingProps {
  onDone: (result: OnboardingResult) => void;
  /** The macOS traffic lights are drawn over the top left. */
  windowControls: boolean;
}

/**
 * First run: a welcome, then the person's name, their role, the agents to set
 * up and the setup itself, then the board. Every step after the welcome can
 * be skipped, and every action has a key.
 */
export function Onboarding({ onDone, windowControls }: OnboardingProps) {
  const [state, dispatch] = useReducer(step, undefined, startOnboarding);
  const [detected, setDetected] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const { shown, leaving } = useLeavingStep(state.step);

  // Detection starts on the welcome, so the cards are ready by the time
  // anyone reaches them.
  useEffect(() => {
    void detectAgents(invoke)
      .then((agents) => dispatch({ type: "detected", agents }))
      .catch(() => {})
      .finally(() => setDetected(true));
  }, []);

  const install = (tools: string[]) =>
    installTools(tools, (tool) => invoke<InstallStep[]>("install_tool", { tool }), dispatch);

  const openBoard = async () => {
    setFinishing(true);
    setSaveError(false);
    try {
      onDone(await finishOnboarding(invoke, state.name, state.role));
    } catch {
      setSaveError(true);
      setFinishing(false);
    }
  };

  // Setup starts from the event that opens its screen, not from an effect,
  // so each install runs once.
  const send = (event: OnboardingEvent) => {
    if (finishing) return;
    if (state.step === "finish" && event.type === "next") return void openBoard();
    const next = step(state, event);
    dispatch(event);
    if (state.step !== "setup" && next.step === "setup") void install(next.picked);
  };

  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
    const event = onboardingKey(state, e.key, e.target instanceof HTMLInputElement);
    if (!event) return;
    e.preventDefault();
    send(event);
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const next = () => send({ type: "next" });
  const skip = () => send({ type: "skip" });
  const showsBack = state.step !== "welcome" && state.step !== "finish";
  const canGoBack = step(state, { type: "back" }).step !== state.step;
  const agentName = (id: string) => state.agents.find((agent) => agent.id === id)?.name ?? id;

  // Clipped rather than hidden: the rays reach past the window, and a hidden
  // overflow still scrolls sideways when a control is brought into view.
  return (
    <div className="fixed inset-0 z-50 overflow-clip bg-background text-foreground">
      <OnboardingBackdrop dim={state.step !== "welcome"} />

      <header
        data-tauri-drag-region
        className="absolute inset-x-0 top-0 z-10 flex h-13 items-center justify-between px-4"
        style={windowControls ? { paddingLeft: markStart(true) } : undefined}
      >
        <div className="flex w-30">
          {showsBack && (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Back"
              disabled={!canGoBack}
              onClick={() => send({ type: "back" })}
              className="text-muted-foreground"
            >
              <ChevronLeft />
              <Kbd>Esc</Kbd>
            </Button>
          )}
        </div>
        <div
          aria-hidden
          className={cn("flex gap-1.5 transition-opacity duration-400", state.step === "welcome" && "opacity-0")}
        >
          {[0, 1, 2, 3].map((bar) => (
            <Progress
              key={bar}
              value={bar < litBars(state.step) ? 100 : 0}
              className="h-0.75 w-5.5"
            />
          ))}
        </div>
        <div className="w-30" />
      </header>

      <main className="absolute inset-x-0 top-13 bottom-0 overflow-y-auto">
        <section
          key={shown}
          className={cn(
            "mx-auto flex min-h-full w-full flex-col justify-center px-8 pt-4 pb-14 short:pt-0 short:pb-4",
            WIDTHS[shown],
            leaving && "animate-out fade-out slide-out-to-top-2 duration-200 fill-mode-forwards",
          )}
        >
          {shown === "welcome" && (
            <>
              <h1
                className={cn("mb-4 flex items-center gap-4 font-serif text-5xl leading-none tracking-tight", RISE)}
                style={rise(2)}
              >
                <BrandMark className="size-8 shrink-0" />
                OpenPlan
              </h1>
              <p className={cn("mb-8 max-w-md text-base text-muted-foreground", RISE)} style={rise(5)}>
                Every plan you and your agents write, in one place.
              </p>
              <MainButton onClick={next} index={7}>
                Get started
              </MainButton>
            </>
          )}

          {shown === "name" && (
            <>
              <Title sub="Your name shows on comments and replies you write.">What should we call you?</Title>
              <Input
                aria-label="Your name"
                value={state.name}
                onChange={(e) => send({ type: "name", name: e.target.value })}
                placeholder="Your name"
                autoComplete="off"
                autoFocus
                className={cn("h-auto bg-card/80 px-3.5 py-3 text-2xl md:text-2xl", RISE)}
                style={rise(2)}
              />
              <Actions index={3}>
                <MainButton onClick={next}>Continue</MainButton>
                <SkipButton onClick={skip} />
              </Actions>
            </>
          )}

          {shown === "role" && (
            <>
              <Title sub="Every plan gets questions from four reviewers. Your role decides who they are.">
                What do you do?
              </Title>
              <div className={RISE} style={rise(2)}>
                <RolePicker value={state.role} onChange={(role) => send({ type: "pickRole", role })} />
              </div>
              <div className={cn("mt-8 short:mt-3", RISE)} style={rise(3)}>
                <PanelPreview role={state.role} />
              </div>
              <Actions index={4}>
                <MainButton onClick={next} disabled={!canContinue(state)}>
                  Continue
                </MainButton>
                <SkipButton onClick={skip} />
                <span className="ml-auto text-xs text-muted-foreground">You can change this in Settings.</span>
              </Actions>
            </>
          )}

          {shown === "agents" && (
            <>
              <Title sub="We set up OpenPlan in each one you pick, so it can file plans here and read your standards.">
                Which agents do you use?
              </Title>
              <div className={RISE} style={rise(2)}>
                {detected ? (
                  <AgentPicker
                    agents={state.agents}
                    picked={state.picked}
                    onToggle={(id) => send({ type: "toggleAgent", id })}
                  />
                ) : (
                  <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" />
                    Looking for agents on this computer
                  </p>
                )}
              </div>
              <p className={cn("mt-3 text-xs text-muted-foreground", RISE)} style={rise(3)}>
                Each one gets the OpenPlan server and a short note in its instructions. Nothing else in its files
                changes.
              </p>
              <Actions index={4}>
                <MainButton onClick={next}>{state.picked.length > 0 ? "Set up" : "Continue"}</MainButton>
                <SkipButton onClick={skip} />
              </Actions>
            </>
          )}

          {shown === "setup" && (
            <>
              <Title sub="This takes a few seconds.">Setting up your agents</Title>
              <div className={RISE} style={rise(2)}>
                <AgentSetup
                  rows={state.setup}
                  agentName={agentName}
                  onRetry={(tool) => void install([tool])}
                />
              </div>
              <Actions index={3}>
                <MainButton onClick={next} disabled={!canContinue(state)}>
                  Continue
                </MainButton>
              </Actions>
            </>
          )}

          {shown === "finish" && (
            <>
              <h2
                className={cn("mb-2 font-serif text-5xl leading-tight short:text-4xl", RISE)}
                style={rise(0)}
              >
                {state.name.trim() ? `Welcome, ${state.name.trim()}` : "You're all set"}
              </h2>
              <p className={cn("mb-6 max-w-md text-sm text-muted-foreground short:mb-3", RISE)} style={rise(1)}>
                Your board has a Demo folder with a plan at every stage. A short tour walks you through them.
              </p>
              <MainButton onClick={next} disabled={finishing} index={2}>
                Open my board
              </MainButton>
              {saveError && (
                <p className="mt-3 text-xs text-destructive">Couldn't save your settings. Try again.</p>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

/** How wide each screen's column is, and how it lines up. */
const WIDTHS: Record<OnboardingStep, string> = {
  welcome: "max-w-xl items-center pb-24 text-center short:pb-16",
  name: "max-w-120",
  role: "max-w-170",
  agents: "max-w-170",
  setup: "max-w-130",
  finish: "max-w-xl items-center text-center",
};

/** The screen on show, which trails the step by a short fade out. */
function useLeavingStep(current: OnboardingStep): { shown: OnboardingStep; leaving: boolean } {
  const [shown, setShown] = useState(current);
  useEffect(() => {
    if (current === shown) return;
    const timer = setTimeout(() => setShown(current), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [current, shown]);
  return { shown, leaving: current !== shown };
}

/** Staggers a screen's parts as they rise. */
function rise(index: number): CSSProperties {
  return { animationDelay: `${index * 70}ms` };
}

function Title({ children, sub }: { children: ReactNode; sub: string }) {
  return (
    <>
      <h2 className={cn("mb-2 font-serif text-4xl leading-tight short:mb-1 short:text-2xl", RISE)} style={rise(0)}>
        {children}
      </h2>
      <p className={cn("mb-6 text-sm text-muted-foreground short:mb-3", RISE)} style={rise(1)}>
        {sub}
      </p>
    </>
  );
}

function Actions({ children, index }: { children: ReactNode; index: number }) {
  return (
    <div className={cn("mt-8 flex items-center gap-2 short:mt-4", RISE)} style={rise(index)}>
      {children}
    </div>
  );
}

/** The screen's main action, which Enter presses too. */
function MainButton({
  children,
  onClick,
  disabled,
  index,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  index?: number;
}) {
  return (
    <Button
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className={cn("gap-2.5 pr-3 pl-4.5 active:scale-98", index != null && RISE)}
      style={index != null ? rise(index) : undefined}
    >
      {children}
      <Kbd className="bg-primary-foreground/15 text-primary-foreground">↵</Kbd>
    </Button>
  );
}

function SkipButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="lg" onClick={onClick} className="text-muted-foreground">
      Skip
    </Button>
  );
}
