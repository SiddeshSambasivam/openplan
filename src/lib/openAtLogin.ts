import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";

/** Whether the system opens OpenPlan when the person logs in. */
export function opensAtLogin(): Promise<boolean> {
  return isEnabled();
}

/** Returns what the system reports afterwards, which is what to show. */
export async function setOpenAtLogin(on: boolean): Promise<boolean> {
  await (on ? enable() : disable());
  return isEnabled();
}
