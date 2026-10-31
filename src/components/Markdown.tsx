import { memo, type MouseEvent } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import { cn } from "../lib/utils";
import { fenceLanguage } from "../lib/fences";
import { basename, isVideoPath, openExternal, resolveAssetSrc } from "../lib/platform";
import { HtmlFence } from "./HtmlFence";
import { Mermaid } from "./Mermaid";

// Minimal shape we need from react-markdown's hast nodes — avoids pulling in
// the full `hast` type package for a handful of fields.
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown; src?: unknown };
  children?: HastNode[];
}

function hastToText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastToText).join("");
}

/** A `<video>`'s file: its own src, or else its first `<source>`'s. */
function videoFile(node: HastNode | undefined): string | undefined {
  const own = node?.properties?.src;
  if (typeof own === "string") return own;
  const source = node?.children?.find(
    (child) => child.type === "element" && child.tagName === "source",
  );
  const src = source?.properties?.src;
  return typeof src === "string" ? src : undefined;
}

interface PositionedNode {
  type: string;
  tagName?: string;
  position?: { start?: { line?: number }; end?: { line?: number } };
  properties?: Record<string, unknown>;
  children?: PositionedNode[];
}

function tagSourceLines(node: PositionedNode, offset: number) {
  if (node.type === "element" && node.position?.start?.line != null) {
    node.properties ??= {};
    node.properties.dataLine = node.position.start.line + offset;
    node.properties.dataLineEnd =
      (node.position.end?.line ?? node.position.start.line) + offset;
  }
  node.children?.forEach((child) => tagSourceLines(child, offset));
}

/** Tags every rendered element with `data-line`/`data-line-end` (1-indexed,
 * inclusive) from its markdown source position — lets the comments feature
 * map a DOM selection back to source lines without re-parsing anything.
 * `offset` puts a slice of a document back into the document's own lines. */
function rehypeSourceLines(offset: number) {
  return (tree: PositionedNode) => {
    tagSourceLines(tree, offset);
  };
}

function wrapMathBlocks(node: PositionedNode) {
  node.children = node.children?.map((child) => {
    if (fenceLanguage(child) !== "math") {
      wrapMathBlocks(child);
      return child;
    }
    const { dataLine, dataLineEnd } = child.properties ?? {};
    return {
      type: "element",
      tagName: "div",
      properties: { dataLine, dataLineEnd },
      children: [child],
    };
  });
}

/** KaTeX swaps a block formula's `pre` for markup with no source position.
 * A stamped wrapper around it keeps the formula on its source lines. */
function rehypeWrapMathBlocks() {
  return (tree: PositionedNode) => {
    wrapMathBlocks(tree);
  };
}

// GitHub-like sanitize schema, extended for task lists, footnotes,
// fenced-code language classes (rehype-highlight runs after sanitizing),
// video, and the source-line data attributes rehypeSourceLines adds above.
// Autoplay is never allowed.
const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "input",
    "details",
    "summary",
    "kbd",
    "mark",
    "video",
    "source",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [
      ...(defaultSchema.attributes?.["*"] ?? []),
      "dataLine",
      "dataLineEnd",
    ],
    input: ["type", "checked", "disabled"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./],
    ],
    li: [...(defaultSchema.attributes?.li ?? []), ["className", "task-list-item"]],
    ul: [...(defaultSchema.attributes?.ul ?? []), ["className", "contains-task-list"]],
    section: [
      ...(defaultSchema.attributes?.section ?? []),
      ["className", "footnotes"],
    ],
    video: ["src", "poster", "controls", "preload", "muted", "loop", "playsInline"],
    source: ["src"],
  },
};

// Plans quote prices, so a lone dollar sign is text. Inline math is `$$x$$`
// on one line, and a block is `$$` on its own lines.
const remarkPlugins: NonNullable<Options["remarkPlugins"]> = [remarkGfm, [remarkMath, { singleDollarTextMath: false }]];

function rehypePlugins(offset: number) {
  return [
    rehypeRaw,
    [rehypeSourceLines, offset],
    [rehypeSanitize, schema],
    // KaTeX runs on sanitized input and builds its own markup, like the
    // highlighter below, so the schema never has to allow its inline styles.
    rehypeWrapMathBlocks,
    rehypeKatex,
    rehypeSlug,
    // mermaid blocks are rendered as diagrams (see the `pre` override below),
    // not syntax-highlighted source.
    [rehypeHighlight, { plainText: ["mermaid"] }],
    // react-markdown accepts this plugin-list shape; the cast quiets TS.
  ] as import("react-markdown").Options["rehypePlugins"];
}

function handleAnchorClick(e: MouseEvent<HTMLAnchorElement>, href?: string) {
  if (!href) return;
  if (href.startsWith("#")) {
    // In-document anchor: scroll instead of navigating the webview.
    e.preventDefault();
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // use as-is
    }
    const el =
      document.getElementById(id) ??
      document.getElementById(`user-content-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (/^(https?:|mailto:)/i.test(href)) {
    // External link: open in the system browser, never inside the app shell.
    e.preventDefault();
    void openExternal(href);
  } else {
    // Relative links to other local files aren't supported yet.
    e.preventDefault();
  }
}

/** What a video shows as when media is off: a link naming its file. */
function FileLink({ src, label }: { src?: string; label?: string }) {
  if (!src) return null;
  return (
    <a href={src} onClick={(e) => handleAnchorClick(e, src)}>
      {label || basename(src)}
    </a>
  );
}

interface MarkdownProps {
  content: string;
  /** Absolute path of the doc on disk — used to resolve relative image paths. */
  docPath?: string;
  /** Re-renders mermaid diagrams with the matching neutral palette. */
  dark: boolean;
  /** Lines above `content` in the document it was sliced out of. */
  lineOffset?: number;
  /** Extra classes on the rendered article. */
  className?: string;
  /** Plays videos and runs `html` fences. Off, they show as a link and as
   * code. Math renders either way. */
  media?: boolean;
}

export const Markdown = memo(function Markdown({
  content,
  docPath,
  dark,
  lineOffset = 0,
  className,
  media = false,
}: MarkdownProps) {
  const components: Components = {
    a({ href, children, ...props }) {
      return (
        <a href={href} onClick={(e) => handleAnchorClick(e, href)} {...props}>
          {children}
        </a>
      );
    },
    img({ node, ...props }) {
      const raw =
        typeof node?.properties?.src === "string"
          ? node.properties.src
          : typeof props.src === "string"
            ? props.src
            : undefined;
      const alt = typeof props.alt === "string" ? props.alt : "";
      if (isVideoPath(raw)) {
        if (!media) return <FileLink src={raw} label={alt} />;
        return (
          <video
            src={resolveAssetSrc(raw, docPath)}
            aria-label={alt || undefined}
            preload="metadata"
            controls
          />
        );
      }
      return <img {...props} src={resolveAssetSrc(raw, docPath)} loading="lazy" alt={alt} />;
    },
    video({ node, src, poster, preload, children, ...props }) {
      if (!media) return <FileLink src={videoFile(node as HastNode | undefined)} />;
      return (
        <video
          {...props}
          src={resolveAssetSrc(src, docPath)}
          poster={resolveAssetSrc(poster, docPath)}
          preload={preload ?? "metadata"}
          // A video with no controls and no autoplay could never start.
          controls
          autoPlay={false}
        >
          {children}
        </video>
      );
    },
    source({ node, src, ...props }) {
      return <source {...props} src={resolveAssetSrc(src, docPath)} />;
    },
    pre({ children, node, ...props }) {
      const fence = node as HastNode | undefined;
      const language = fenceLanguage(fence);
      if (language === "mermaid") {
        return <Mermaid code={hastToText(fence)} dark={dark} />;
      }
      if (language === "html" && media) {
        return (
          <HtmlFence code={hastToText(fence)} dark={dark} {...props}>
            <pre {...props}>{children}</pre>
          </HtmlFence>
        );
      }
      return <pre {...props}>{children}</pre>;
    },
  };

  return (
    <article
      className={cn(
        "markdown-body prose prose-neutral dark:prose-invert max-w-none",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins(lineOffset)}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
});
