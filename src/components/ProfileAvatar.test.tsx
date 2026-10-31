import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileAvatar } from "./ProfileAvatar";

describe("ProfileAvatar", () => {
  it("draws the marble without a picture", () => {
    const html = renderToStaticMarkup(<ProfileAvatar seed="sid@example.com" />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });

  it("shows the picture, cropped to a circle, when there is one", () => {
    const html = renderToStaticMarkup(
      <ProfileAvatar seed="sid@example.com" picture="/settings/avatar-1.png" />,
    );
    expect(html).toMatch(/<img[^>]*src="\/settings\/avatar-1.png"/);
    expect(html).toMatch(/<img[^>]*class="[^"]*rounded-full[^"]*object-cover/);
    expect(html).not.toContain("<svg");
  });
});
