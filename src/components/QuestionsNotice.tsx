import { TooltipButton } from "./TooltipButton";

interface QuestionsNoticeProps {
  text: string;
  onOpen: () => void;
}

/** The top bar's word that an agent posted questions. The plan stays on the
 * tab the person is reading until they click Open. */
export function QuestionsNotice({ text, onOpen }: QuestionsNoticeProps) {
  return (
    <>
      <span
        title={text}
        className="max-w-80 min-w-0 animate-in truncate pl-1 text-xs text-muted-foreground fade-in"
      >
        {text}
      </span>
      <TooltipButton
        size="xs"
        variant="outline"
        onClick={onOpen}
        tooltip="Show the questions on the Alignment tab"
      >
        Open
      </TooltipButton>
    </>
  );
}
