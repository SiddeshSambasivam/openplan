import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuestionsNotice } from "./QuestionsNotice";

describe("QuestionsNotice", () => {
  it("says who asked and offers Open", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <QuestionsNotice text="Theo asked 2 questions" onOpen={() => {}} />
      </TooltipProvider>,
    );

    expect(html).toContain("Theo asked 2 questions");
    expect(html).toContain("Open");
  });

  it("opens the questions from Open", () => {
    const onOpen = vi.fn();
    const notice = QuestionsNotice({ text: "Theo asked a question", onOpen }) as ReactElement<{
      children: ReactElement<{ children?: unknown; onClick?: () => void }>[];
    }>;
    const open = notice.props.children.find((child) => child.props.children === "Open");

    open?.props.onClick?.();

    expect(onOpen).toHaveBeenCalledOnce();
  });
});
