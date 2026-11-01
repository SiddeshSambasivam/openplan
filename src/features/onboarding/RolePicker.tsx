import { Code, Ellipsis, PenTool, Sparkles, Target, Users, type LucideIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { RadioGroup } from "@/components/ui/radio-group";
import { PERSON_ROLES, type PersonRoleId } from "@/lib/personRoles";
import { cn } from "@/lib/utils";
import { choiceCard, ChoiceCardBody } from "./ChoiceCard";

const ROLE_ICONS: Record<PersonRoleId, LucideIcon> = {
  engineer: Code,
  designer: PenTool,
  product: Target,
  lead: Users,
  founder: Sparkles,
  other: Ellipsis,
};

/**
 * The six roles as cards in a radio group. Onboarding shows each card's
 * number key; the compact form, for Settings, drops the keys, the icons and
 * the hints.
 */
export function RolePicker({
  value,
  onChange,
  compact = false,
}: {
  value: PersonRoleId | null;
  onChange: (role: PersonRoleId) => void;
  compact?: boolean;
}) {
  return (
    <RadioGroup
      aria-label="Your role"
      value={value ?? ""}
      onValueChange={(next) => onChange(next as PersonRoleId)}
      className={cn("grid-cols-2 sm:grid-cols-3", compact ? "gap-2" : "gap-3 short:gap-2")}
    >
      {PERSON_ROLES.map((role, index) => {
        const Icon = ROLE_ICONS[role.id];
        const checked = role.id === value;
        return (
          <RadioGroupPrimitive.Item
            key={role.id}
            value={role.id}
            className={cn(choiceCard, "group", compact && "px-3 py-2.5")}
          >
            <ChoiceCardBody
              picture={
                compact ? undefined : (
                  <Icon className="mb-2.5 block size-4.5 text-muted-foreground group-aria-checked:text-foreground short:hidden" />
                )
              }
              label={role.label}
              hint={compact ? undefined : role.hint}
              keyHint={compact ? undefined : String(index + 1)}
              checked={checked}
            />
          </RadioGroupPrimitive.Item>
        );
      })}
    </RadioGroup>
  );
}
