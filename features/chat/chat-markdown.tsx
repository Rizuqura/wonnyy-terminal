import { memo } from "react";
import { inlineParts, markdownBlocks } from "./markdown-format";
function Inline({ text, depth = 0 }: { text: string; depth?: number }) {
  if (depth > 3) return <>{text}</>;
  return (
    <>
      {inlineParts(text).map((part, i) => {
        if (part.kind === "strong")
          return (
            <strong key={i}>
              <Inline text={part.text} depth={depth + 1} />
            </strong>
          );
        if (part.kind === "em")
          return (
            <em key={i}>
              <Inline text={part.text} depth={depth + 1} />
            </em>
          );
        if (part.kind === "del") return <del key={i}>{part.text}</del>;
        if (part.kind === "code") return <code key={i}>{part.text}</code>;
        if (part.kind === "link")
          return (
            <a
              key={i}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Inline text={part.text} depth={depth + 1} />
            </a>
          );
        return part.text;
      })}
    </>
  );
}
export const ChatMarkdown = memo(function ChatMarkdown({
  content,
}: {
  content: string;
}) {
  return (
    <div className="chat-rich-text">
      {markdownBlocks(content).map((block, i) => {
        if (block.kind === "code")
          return (
            <pre key={i}>
              <code data-language={block.language || undefined}>
                {block.text}
              </code>
            </pre>
          );
        if (block.kind === "heading") {
          const Tag = `h${block.level}` as "h3" | "h4" | "h5" | "h6";
          return (
            <Tag key={i}>
              <Inline text={block.text} />
            </Tag>
          );
        }
        if (block.kind === "list") {
          const items = block.items.map((item, j) => (
            <li key={j}>
              <Inline text={item} />
            </li>
          ));
          return block.ordered ? (
            <ol key={i} start={block.start}>
              {items}
            </ol>
          ) : (
            <ul key={i}>{items}</ul>
          );
        }
        if (block.kind === "table")
          return (
            <div className="chat-table-scroll" key={i}>
              <table>
                <thead>
                  <tr>
                    {block.head.map((cell, j) => (
                      <th scope="col" key={j}>
                        <Inline text={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k}>
                          <Inline text={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        if (block.kind === "quote")
          return (
            <blockquote key={i}>
              <Inline text={block.text} />
            </blockquote>
          );
        if (block.kind === "rule") return <hr key={i} />;
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        );
      })}
    </div>
  );
});
