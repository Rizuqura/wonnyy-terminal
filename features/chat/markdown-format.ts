export type InlinePart =
  | { kind: "text" | "strong" | "em" | "code" | "del"; text: string }
  | { kind: "link"; text: string; href: string };
export function safeHref(value: string): string | null {
  if (/[\u0000-\u0020\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname ? url.href : null;
  } catch {
    return null;
  }
}
export function inlineParts(value: string): InlinePart[] {
  const pattern =
    /(!?\[([^\]\n]{1,500})\]\(([^)\s]{1,2048})\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_|~~([^~\n]+)~~)/g;
  const parts: InlinePart[] = [];
  let offset = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index! > offset)
      parts.push({ kind: "text", text: value.slice(offset, match.index) });
    if (match[2] !== undefined) {
      const href = safeHref(match[3]);
      parts.push(
        match[1].startsWith("!")
          ? { kind: "text", text: `[Image: ${match[2]}]` }
          : href
            ? { kind: "link", text: match[2], href }
            : { kind: "text", text: match[0] },
      );
    } else {
      const inner =
        match[4] ?? match[5] ?? match[6] ?? match[7] ?? match[8] ?? match[9];
      const emphasis = match[6] === undefined && match[9] === undefined;
      if (
        emphasis &&
        (inner.trim() !== inner ||
          (match[0].startsWith("_") &&
            (/[\p{L}\p{N}]/u.test(value[(match.index ?? 0) - 1] ?? "") ||
              /[\p{L}\p{N}]/u.test(
                value[(match.index ?? 0) + match[0].length] ?? "",
              ))))
      )
        parts.push({ kind: "text", text: match[0] });
      else
        parts.push({
          kind:
            match[4] !== undefined || match[5] !== undefined
              ? "strong"
              : match[6] !== undefined
                ? "code"
                : match[9] !== undefined
                  ? "del"
                  : "em",
          text:
            match[4] ??
            match[5] ??
            match[6] ??
            match[7] ??
            match[8] ??
            match[9],
        });
    }
    offset = match.index! + match[0].length;
  }
  if (offset < value.length)
    parts.push({ kind: "text", text: value.slice(offset) });
  return parts;
}
export type MarkdownBlock =
  | { kind: "paragraph" | "quote"; text: string }
  | { kind: "heading"; text: string; level: number }
  | { kind: "code"; text: string; language: string }
  | { kind: "list"; items: string[]; ordered: boolean; start: number }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "rule" };
function cells(line: string): string[] {
  const result: string[] = [];
  let current = "",
    code = false;
  let content = line.trim().replace(/^\|/, "");
  if (content.endsWith("|") && !content.endsWith("\\|"))
    content = content.slice(0, -1);
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === "\\" && content[i + 1] === "|") {
      current += "|";
      i++;
    } else if (char === "`") {
      code = !code;
      current += char;
    } else if (char === "|" && !code) {
      result.push(current.trim());
      current = "";
    } else current += char;
  }
  result.push(current.trim());
  return result;
}
const divider = (line: string) =>
  /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
const listItem = (line: string) =>
  line.match(/^\s{0,3}(?:([-+*])|(\d{1,9})[.)])\s+(.+)$/);
const startsBlock = (line: string) =>
  /^\s{0,3}(?:#{1,6}\s|`{3,}|~{3,}|>\s?|[-+*]\s|\d{1,9}[.)]\s)/.test(line);
export function markdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replaceAll("\r\n", "\n").split("\n"),
    blocks: MarkdownBlock[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})([\w+-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (
        i < lines.length &&
        !new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`).test(
          lines[i],
        )
      )
        code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ kind: "code", text: code.join("\n"), language: fence[2] });
      continue;
    }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: Math.min(6, heading[1].length + 2),
        text: heading[2].replace(/\s+#+\s*$/, ""),
      });
      i++;
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      const quotes: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i]))
        quotes.push(lines[i++].replace(/^\s{0,3}> ?/, ""));
      blocks.push({ kind: "quote", text: quotes.join("\n") });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && divider(lines[i + 1])) {
      const head = cells(line),
        rows: string[][] = [];
      let end = i + 2;
      while (
        end < lines.length &&
        lines[end].trim() &&
        lines[end].includes("|")
      )
        rows.push(cells(lines[end++]));
      if (
        head.length <= 32 &&
        rows.length <= 200 &&
        rows.every((row) => row.length === head.length)
      )
        blocks.push({ kind: "table", head, rows });
      else
        blocks.push({
          kind: "paragraph",
          text: lines.slice(i, end).join("\n"),
        });
      i = end;
      continue;
    }
    const item = listItem(line);
    if (item) {
      const items: string[] = [];
      const ordered = !!item[2];
      let next: RegExpMatchArray | null;
      while (
        i < lines.length &&
        (next = listItem(lines[i])) &&
        !!next[2] === ordered
      ) {
        items.push(next[3]);
        i++;
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]) &&
          !listItem(lines[i])
        )
          items[items.length - 1] += "\n" + lines[i++].trim();
      }
      blocks.push({
        kind: "list",
        items,
        ordered,
        start: Number(item[2] ?? 1),
      });
      continue;
    }
    const paragraph = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !startsBlock(lines[i]) &&
      !(i + 1 < lines.length && lines[i].includes("|") && divider(lines[i + 1]))
    )
      paragraph.push(lines[i++]);
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}
