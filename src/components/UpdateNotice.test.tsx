import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UpdateState } from "@/lib/updates";
import { UpdateNotice } from "./UpdateNotice";

const noop = () => {};

function notice(state: UpdateState): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <UpdateNotice state={state} onUpdate={noop} onLater={noop} />
    </TooltipProvider>,
  );
}

describe("UpdateNotice", () => {
  it("offers Update and Later for a version that is ready", () => {
    const html = notice({ kind: "available", version: "0.6.0" });

    expect(html).toContain("OpenPlan 0.6.0 is ready");
    expect(html).toContain("Update");
    expect(html).toContain("Later");
  });

  it("holds Later back while the update downloads", () => {
    const html = notice({ kind: "downloading", version: "0.6.0", percent: 42 });

    expect(html).toContain("Downloading 42%");
    expect(html).not.toContain("Later");
  });

  it("offers Try again after a failed install", () => {
    const html = notice({ kind: "installFailed", version: "0.6.0" });

    expect(html).toContain("Couldn&#x27;t install the update. Try again.");
    expect(html).toContain("Try again");
  });

  it("offers the download instead of Update to a package install", () => {
    const html = notice({
      kind: "packageInstall",
      version: "0.6.0",
      downloadUrl: "https://cdn.example.net/releases/0.6.0/OpenPlan_0.6.0_amd64.deb",
    });

    expect(html).toContain("This copy can&#x27;t update itself.");
    expect(html).toContain("Download");
    expect(html).not.toContain(">Update<");
  });

  it("shows nothing for a state that is not news", () => {
    expect(notice({ kind: "idle" })).toBe("");
    expect(notice({ kind: "checkFailed" })).toBe("");
  });
});
