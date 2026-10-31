import { MoveHorizontal } from "lucide-react";
import { WIDTH_LABELS, WIDTH_ORDER, type ContentWidth } from "../lib/width";
import { SettingMenu } from "./SettingMenu";

interface WidthMenuProps {
  width: ContentWidth;
  onChange: (width: ContentWidth) => void;
}

export function WidthMenu({ width, onChange }: WidthMenuProps) {
  return (
    <SettingMenu
      icon={MoveHorizontal}
      tooltip="Reading width"
      ariaLabel="Reading width"
      value={width}
      options={WIDTH_ORDER.map((value) => ({ value, label: WIDTH_LABELS[value] }))}
      onChange={onChange}
    />
  );
}
