import { renderToStaticMarkup } from "react-dom/server";
import { DropdownMenu as Menu } from "radix-ui";
import { describe, expect, it } from "vitest";
import type { Identity } from "@/lib/comments";
import { ProfileMenuItems } from "./ProfileMenu";

// The vendored menu portals its content, which a static render leaves out,
// so the rows render inside the primitive's own content here.
function menu(identity: Identity | null, dark = false): string {
  return renderToStaticMarkup(
    <Menu.Root open>
      <Menu.Content>
        <ProfileMenuItems
          identity={identity}
          dark={dark}
          onToggleTheme={() => {}}
          onOpenSettings={() => {}}
          onOpenShortcuts={() => {}}
        />
      </Menu.Content>
    </Menu.Root>,
  );
}

describe("ProfileMenuItems", () => {
  const sid = { name: "Sid", email: "sid@example.com" };

  it("heads the menu with the name and the email", () => {
    const html = menu(sid);
    expect(html).toContain("Sid");
    expect(html).toContain("sid@example.com");
    expect(html).toContain("<svg");
  });

  it("offers settings, the theme and the shortcuts, and nothing else", () => {
    const html = menu(sid);
    const items = [...html.matchAll(/role="menuitem"[^>]*>([^<]*)/g)].map((m) => m[1]);
    expect(items).toEqual(["Settings", "Keyboard shortcuts"]);
    expect(html).toContain("Theme");
    expect(html).toContain(">Light<");
    expect(html).toContain(">Dark<");
  });

  it("marks the current theme as chosen", () => {
    const pressed = (html: string) => html.match(/aria-pressed="true"[^>]*>([^<]*)/)?.[1];
    expect(pressed(menu(sid, false))).toBe("Light");
    expect(pressed(menu(sid, true))).toBe("Dark");
  });

  it("falls back to a plain name without an identity", () => {
    const html = menu(null);
    expect(html).toContain("You");
    expect(html).not.toContain("@");
  });
});
