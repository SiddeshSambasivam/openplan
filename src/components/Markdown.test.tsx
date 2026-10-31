import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Markdown } from "./Markdown";

// The html fence reads the app's theme tokens while it renders. There is no
// DOM here, so every token falls back to its default.
beforeAll(() => {
  vi.stubGlobal("document", { documentElement: {} });
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => "" }));
});

function render(content: string, media = true): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <Markdown content={content} docPath="/base/plans/plan.md" dark={false} media={media} />
    </TooltipProvider>,
  );
}

function iframes(html: string): string[] {
  return html.match(/<iframe[^>]*>/g) ?? [];
}

describe("Markdown math", () => {
  it("renders inline and block formulas with KaTeX", () => {
    const html = render("Area is $$\\pi r^2$$.\n\n$$\nE = mc^2\n$$\n");
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
  });

  it("keeps a block formula on its source lines", () => {
    const html = render("Intro\n\n$$\nE = mc^2\n$$\n");
    expect(html).toMatch(/<div data-line="3" data-line-end="5"><span class="katex-display">/);
  });

  it("renders math when media is off", () => {
    expect(render("$$x$$", false)).toContain('class="katex"');
  });

  it("leaves a price alone", () => {
    const html = render("From $5 to $10 a month.");
    expect(html).not.toContain("katex");
    expect(html).toContain("$5 to $10");
  });

  it("still strips scripts and script links", () => {
    const html = render(
      "<script>alert(1)</script>\n\n$\\href{javascript:alert(1)}{x}$\n",
    );
    expect(html).not.toContain("<script");
    // KaTeX shows the refused command as text, never as a link.
    expect(html).not.toMatch(/<a[\s>]/);
    expect(html).not.toContain('href="javascript:');
  });
});

describe("Markdown video", () => {
  it("plays a video tag with controls and never autoplays", () => {
    const html = render('<video src="./media/clip.mp4" autoplay muted loop></video>');
    expect(html).toMatch(/<video[^>]*src="\.\/media\/clip\.mp4"/);
    expect(html).toMatch(/<video[^>]*controls=""/);
    expect(html).toMatch(/<video[^>]*preload="metadata"/);
    expect(html).not.toContain("autoplay");
  });

  it("keeps source children", () => {
    const html = render('<video controls>\n<source src="./media/clip.webm">\n</video>');
    expect(html).toMatch(/<video[^>]*>\s*<source[^>]*src="\.\/media\/clip\.webm"/);
  });

  it("renders an image link to a video file as a video", () => {
    const html = render("![Demo](./media/clip.mp4)");
    expect(html).toMatch(/<video[^>]*src="\.\/media\/clip\.mp4"/);
    expect(html).not.toContain("<img");
    expect(render("![Shot](./media/shot.png)")).toContain("<img");
  });

  it("shows a link to the file when media is off", () => {
    for (const content of [
      '<video src="./media/clip.mp4" controls></video>',
      '<video controls><source src="./media/clip.mp4"></video>',
      "![Demo](./media/clip.mp4)",
    ]) {
      const html = render(content, false);
      expect(html).not.toContain("<video");
      expect(html).toMatch(/<a href="\.\/media\/clip\.mp4"[^>]*>/);
    }
  });
});

describe("Markdown html fences", () => {
  const button = "<button onclick=\"this.textContent='Done'\">Go</button>";

  it("renders html fences in a frame that may only run scripts", () => {
    for (const fence of ["```html", "```HTML", "```html title=x"]) {
      const frames = iframes(render(`${fence}\n${button}\n\`\`\`\n`));
      expect(frames).toHaveLength(1);
      expect(frames[0]).toContain('sandbox="allow-scripts"');
    }
  });

  it("keeps the frame on the fence's source lines", () => {
    const html = render(`Intro\n\n\`\`\`html\n${button}\n\`\`\`\n`);
    // The stamped wrapper holds the toggle row, then the frame.
    expect(html).toMatch(
      /<div data-line="3" data-line-end="5"><div[^>]*><button[^>]*>Show code<\/button><\/div><iframe/,
    );
  });

  it("shows highlighted code when media is off", () => {
    const html = render(`\`\`\`html\n${button}\n\`\`\`\n`, false);
    expect(iframes(html)).toHaveLength(0);
    expect(html).toContain("<pre");
  });

  it("leaves other fences as code", () => {
    const html = render("```js\nconst a = 1;\n```\n");
    expect(iframes(html)).toHaveLength(0);
  });
});
