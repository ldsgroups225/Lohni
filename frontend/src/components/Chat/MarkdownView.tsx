import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";

type Props = { md: string; inline?: boolean };

const blockElements = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "hr"];

const components: Components = {
  h1: (p) => <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mt-2 mb-4 break-words" {...p} />,
  h2: (p) => <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold tracking-tight mt-6 mb-3 break-words" {...p} />,
  h3: (p) => <h3 className="text-lg sm:text-xl lg:text-2xl font-semibold tracking-tight mt-5 mb-2 break-words" {...p} />,
  p: (p) => <p className="my-3 break-words" {...p} />,
  ul: (p) => <ul className="my-3 list-disc pl-6 space-y-1" {...p} />,
  ol: (p) => <ol className="my-3 list-decimal pl-6 space-y-1" {...p} />,
  li: (p) => <li className="my-1 break-words" {...p} />,
  strong: (p) => <strong className="font-semibold" {...p} />,
  hr: (p) => <hr className="my-6 border-border" {...p} />,
  blockquote: (p) => (
    <blockquote className="my-4 border-l-4 border-border bg-surface text-muted pl-4 italic" {...p} />
  ),
  table: (p) => (
    <div className="my-4 overflow-x-auto max-w-full">
      <table className="min-w-full text-left border-collapse bg-surface text-foreground" {...p} />
    </div>
  ),
  thead: (p) => <thead className="border-b border-border" {...p} />,
  th: (p) => <th className="px-3 py-2 font-semibold" {...p} />,
  td: (p) => <td className="px-3 py-2 align-top" {...p} />,
  code: ({ inline, className, children, ...rest }: any) => {
    if (inline) {
      return (
        <code className="px-1.5 py-0.5 rounded bg-surface text-foreground text-xs sm:text-sm break-all" {...rest}>
          {children}
        </code>
      );
    }
    return (
      <pre className="border border-border rounded-lg p-3 overflow-x-auto max-w-full text-xs sm:text-sm bg-surface text-foreground my-3">
        <code className={className} {...rest}>
          {children}
        </code>
      </pre>
    );
  },
};

// The model often wraps plain numbers in LaTeX ($1$); KaTeX would render them in a serif font mid-sentence.
const plainNumbers = (md: string) => md.replace(/\$\s*(-?\d+(?:[.,]\d+)?)\s*\$/g, "$1");

export default function MarkdownView({ md, inline = false }: Props) {
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className={inline ? "break-words" : "max-w-none leading-relaxed w-full overflow-hidden"}>
      <ReactMarkdown
        skipHtml
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={inline ? undefined : components}
        disallowedElements={inline ? blockElements : undefined}
        unwrapDisallowed={inline}
      >
        {plainNumbers(md || "")}
      </ReactMarkdown>
    </Wrapper>
  );
}