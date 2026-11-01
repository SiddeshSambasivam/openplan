import { describe, expect, it } from "vitest";
import { saveThenQuit } from "./quit";

describe("saveThenQuit", () => {
  it("quits only once the save has finished", async () => {
    const order: string[] = [];
    const save = async () => {
      await Promise.resolve();
      order.push("saved");
    };

    await saveThenQuit(save, async () => {
      order.push("quit");
    });

    expect(order).toEqual(["saved", "quit"]);
  });

  it("still quits when the save fails", async () => {
    let quit = false;
    const save = async () => {
      throw new Error("disk full");
    };

    await saveThenQuit(save, async () => {
      quit = true;
    }).catch(() => {});

    expect(quit).toBe(true);
  });
});
