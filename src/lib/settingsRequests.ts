// Lets a view deep in the app open Settings without the app passing a
// handler down to it. The Settings dialog listens.
const requests = new EventTarget();

/** Opens Settings on the Role row. */
export function openRoleSettings(): void {
  requests.dispatchEvent(new Event("role"));
}

/** Calls `handler` on each request until the returned function runs. */
export function onRoleSettingsRequest(handler: () => void): () => void {
  requests.addEventListener("role", handler);
  return () => requests.removeEventListener("role", handler);
}

/** Opens Settings on Agents. */
export function openAgentSettings(): void {
  requests.dispatchEvent(new Event("agents"));
}

/** Calls `handler` on each request until the returned function runs. */
export function onAgentSettingsRequest(handler: () => void): () => void {
  requests.addEventListener("agents", handler);
  return () => requests.removeEventListener("agents", handler);
}
