import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return <div className="markdown break-words text-[15px] leading-7"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown></div>;
}
