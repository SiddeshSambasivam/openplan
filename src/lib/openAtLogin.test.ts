import { beforeEach, describe, expect, it, vi } from "vitest";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { opensAtLogin, setOpenAtLogin } from "./openAtLogin";

let registered = false;
vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: vi.fn(async () => {
    registered = true;
  }),
  disable: vi.fn(async () => {
    registered = false;
  }),
  isEnabled: vi.fn(async () => registered),
}));

beforeEach(() => {
  registered = false;
  vi.clearAllMocks();
});

describe("open at login", () => {
  it("reads whether the app is set to open at login", async () => {
    expect(await opensAtLogin()).toBe(false);
    registered = true;
    expect(await opensAtLogin()).toBe(true);
  });

  it("turns it on and reports what the system now says", async () => {
    expect(await setOpenAtLogin(true)).toBe(true);
    expect(enable).toHaveBeenCalledOnce();
    expect(disable).not.toHaveBeenCalled();
  });

  it("turns it off and reports what the system now says", async () => {
    registered = true;
    expect(await setOpenAtLogin(false)).toBe(false);
    expect(disable).toHaveBeenCalledOnce();
    expect(enable).not.toHaveBeenCalled();
    expect(isEnabled).toHaveBeenCalled();
  });
});
