import { describe, expect, it } from "vitest";
import { onRoleSettingsRequest, openRoleSettings } from "./settingsRequests";

describe("openRoleSettings", () => {
  it("reaches each listener until it stops listening", () => {
    let heard = 0;
    const stop = onRoleSettingsRequest(() => heard++);

    openRoleSettings();
    stop();
    openRoleSettings();

    expect(heard).toBe(1);
  });
});
