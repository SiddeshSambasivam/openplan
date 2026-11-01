import { describe, expect, it } from "vitest";
import {
  onAgentSettingsRequest,
  onRoleSettingsRequest,
  openAgentSettings,
  openRoleSettings,
} from "./settingsRequests";

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

describe("openAgentSettings", () => {
  it("reaches only the Agents listeners", () => {
    let agents = 0;
    let role = 0;
    const stopAgents = onAgentSettingsRequest(() => agents++);
    const stopRole = onRoleSettingsRequest(() => role++);

    openAgentSettings();
    stopAgents();
    stopRole();
    openAgentSettings();

    expect([agents, role]).toEqual([1, 0]);
  });
});
