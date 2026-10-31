import { memo, type MouseEvent } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import { cn } from "../lib/utils";
import { openExternal, resolveAssetSrc } from "../lib/platform";
import { Mermaid } from "./Mermaid";

// Minimal shape we need from react-markdown's hast nodes — avoids pulling in
// the full `hast` type package for a handful of fields.
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

function hastToText(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastToText).join("");
}

function mermaidCodeChild(node: HastNode | undefined): HastNode | undefined {
  const child = node?.children?.[0];
  if (child?.type !== "element" || child.tagName !== "code") return undefined;
  const classes = child.properties?.className;
  const isMermaid = Array.isArray(classes) && classes.includes("language-mermaid");
  return isMermaid ? child : undefined;
}

interface PositionedNode {
  type: string;
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

// GitHub-like sanitize schema, extended for task lists, footnotes,
// fenced-code language classes (rehype-highlight runs after sanitizing),
// and the source-line data attributes rehypeSourceLines adds above.
const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "input",
    "details",
    "summary",
    "kbd",
    "mark",
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
  },
};

const remarkPlugins = [remarkGfm];

function rehypePlugins(offset: number) {
  return [
    rehypeRaw,
    [rehypeSourceLines, offset],
    [rehypeSanitize, schema],
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
}

export const Markdown = memo(function Markdown({
  content,
  docPath,
  dark,
  lineOffset = 0,
  className,
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
      return (
        <img
          {...props}
          src={resolveAssetSrc(raw, docPath)}
          loading="lazy"
          alt={typeof props.alt === "string" ? props.alt : ""}
        />
      );
    },
    pre({ children, node, ...props }) {
      const mermaidNode = mermaidCodeChild(node as HastNode | undefined);
      if (mermaidNode) {
        return <Mermaid code={hastToText(mermaidNode)} dark={dark} />;
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
