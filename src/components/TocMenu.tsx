import { TableOfContents as TableOfContentsIcon } from "lucide-react";
import { isMac } from "../lib/platform";
import {
  TOC_VISIBILITY_LABELS,
  TOC_VISIBILITY_ORDER,
  type TocVisibility,
} from "../lib/toc";
import { IconMenu } from "./IconMenu";

interface TocMenuProps {
  visibility: TocVisibility;
  onChange: (visibility: TocVisibility) => void;
}

export function TocMenu({ visibility, onChange }: TocMenuProps) {
  const modShift = isMac ? "⇧⌘" : "Ctrl+Shift+";
  return (
    <IconMenu
      icon={TableOfContentsIcon}
      tooltip={`Outline (${modShift}T)`}
      tooltipSide="bottom-end"
      ariaLabel="Outline visibility"
      value={visibility}
      options={TOC_VISIBILITY_ORDER.map((value) => ({
        value,
        label: TOC_VISIBILITY_LABELS[value],
      }))}
      onChange={onChange}
    />
  );
}
