import type { Role } from "@/lib/work";

/*
 * One clock for every persona avatar on the page. Each tick blinks or turns
 * one avatar that is on screen. The clock runs only while some avatar is in
 * the viewport and the window is visible and focused, and never under
 * reduced motion, so an idle app wakes for nothing.
 */

const mounted = new Set<HTMLElement>();
const onScreen = new Set<HTMLElement>();
let observer: IntersectionObserver | null = null;
let reducedMotion: MediaQueryList | null = null;
let tick: ReturnType<typeof setTimeout> | undefined;

/** Every avatar gets a blink or a look about this often. */
const MEAN_GAP_MS = 2600;
const MIN_TICK_MS = 120;

/** Puts an avatar on the clock. Returns what takes it off. */
export function watchAvatar(avatar: HTMLElement): () => void {
  if (mounted.size === 0) startWatching();
  mounted.add(avatar);
  observer?.observe(avatar);
  return () => {
    observer?.unobserve(avatar);
    mounted.delete(avatar);
    onScreen.delete(avatar);
    if (mounted.size === 0) stopWatching();
    else update();
  };
}

/** A hop with happy eyes, for one role's avatars or, with none, for every
 * persona's. */
export function celebrate(role?: Role): void {
  if (reducedMotion?.matches ?? true) return;
  for (const avatar of mounted) {
    const its = avatar.dataset.role;
    if (role ? its !== role : its === "agent") continue;
    avatar.removeAttribute("data-hop");
    void avatar.offsetWidth; // restarts the hop when one is still running
    avatar.setAttribute("data-hop", "");
    avatar.setAttribute("data-happy", "");
    setTimeout(() => avatar.removeAttribute("data-hop"), 700);
    setTimeout(() => avatar.removeAttribute("data-happy"), 1600);
  }
}

function startWatching(): void {
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const avatar = entry.target as HTMLElement;
      if (entry.isIntersecting) onScreen.add(avatar);
      else onScreen.delete(avatar);
    }
    update();
  });
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotion.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  window.addEventListener("focus", update);
  window.addEventListener("blur", update);
}

function stopWatching(): void {
  observer?.disconnect();
  observer = null;
  reducedMotion?.removeEventListener("change", update);
  document.removeEventListener("visibilitychange", update);
  window.removeEventListener("focus", update);
  window.removeEventListener("blur", update);
  clearTimeout(tick);
  tick = undefined;
}

function running(): boolean {
  return (
    onScreen.size > 0 &&
    !reducedMotion?.matches &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
}

function update(): void {
  const live = running();
  for (const avatar of mounted) avatar.toggleAttribute("data-live", live && onScreen.has(avatar));
  if (live && tick === undefined) schedule();
  if (!live && tick !== undefined) {
    clearTimeout(tick);
    tick = undefined;
  }
}

function schedule(): void {
  const gap = (MEAN_GAP_MS * (0.5 + Math.random())) / onScreen.size;
  tick = setTimeout(() => {
    tick = undefined;
    if (!running()) return;
    const avatars = [...onScreen];
    const avatar = avatars[Math.floor(Math.random() * avatars.length)];
    if (Math.random() < 0.6) blink(avatar);
    else look(avatar);
    schedule();
  }, Math.max(gap, MIN_TICK_MS));
}

/** Sometimes twice. */
function blink(avatar: HTMLElement): void {
  const once = () => {
    avatar.setAttribute("data-blink", "");
    setTimeout(() => avatar.removeAttribute("data-blink"), 110);
  };
  once();
  if (Math.random() < 0.25) setTimeout(once, 230);
}

/** The face slides across the sphere and narrows toward its edge, and the
 * head tilts a little, unless it is bobbing while it types. */
function look(avatar: HTMLElement): void {
  const turn = (Math.random() - 0.5) * 0.36;
  const nod = (Math.random() - 0.5) * 0.12;
  const style = avatar.style;
  style.setProperty("--turn", `${turn}em`);
  style.setProperty("--nod", `${nod}em`);
  style.setProperty("--narrow", String(1 - Math.abs(turn) * 1.1));
  if (!avatar.hasAttribute("data-typing")) {
    style.setProperty("--tilt", `${(Math.random() - 0.5) * 10}deg`);
  }
  setTimeout(
    () => {
      for (const name of ["--turn", "--nod", "--narrow", "--tilt"]) style.removeProperty(name);
    },
    1300 + Math.random() * 900,
  );
}
