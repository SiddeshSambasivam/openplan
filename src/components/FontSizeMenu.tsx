import { ALargeSmall } from "lucide-react";
import { FONT_SIZE_LABELS, FONT_SIZE_ORDER, type FontSize } from "../lib/fontSize";
import { SettingMenu } from "./SettingMenu";

interface FontSizeMenuProps {
  fontSize: FontSize;
  onChange: (fontSize: FontSize) => void;
}

export function FontSizeMenu({ fontSize, onChange }: FontSizeMenuProps) {
  return (
    <SettingMenu
      icon={ALargeSmall}
      tooltip="Font size"
      ariaLabel="Font size"
      value={fontSize}
      options={FONT_SIZE_ORDER.map((value) => ({
        value,
        label: FONT_SIZE_LABELS[value],
      }))}
      onChange={onChange}
    />
  );
}
