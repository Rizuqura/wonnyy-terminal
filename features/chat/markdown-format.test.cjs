const test = require("node:test"),
  assert = require("node:assert/strict");
const {
  markdownBlocks,
  inlineParts,
  safeHref,
} = require("./markdown-format.ts");
test("assistant formatting supports bold, emphasis, code, headings, lists and quotes without changing source values", () => {
  const blocks = markdownBlocks(
    "## Findings\n\n**ALPHA** allocation is **25%**. Use `allocation`.\n\n1. First fact\n2. Second *fact*\n\n> Quoted evidence",
  );
  assert.deepEqual(
    blocks.map((b) => b.kind),
    ["heading", "paragraph", "list", "quote"],
  );
  assert.deepEqual(
    inlineParts("**25%**").map((p) => [p.kind, p.text]),
    [["strong", "25%"]],
  );
  assert.equal(blocks[2].ordered, true);
  assert.equal(blocks[2].items.length, 2);
  assert.equal(
    inlineParts("5 * 10 * 15")
      .map((p) => p.text)
      .join(""),
    "5 * 10 * 15",
  );
  assert.equal(
    inlineParts("file_name_x")
      .map((p) => p.text)
      .join(""),
    "file_name_x",
  );
});
test("code fences, incomplete fences and tables preserve literal values and escaped pipes", () => {
  const blocks = markdownBlocks(
    "```html\n<script>bad()</script>\n```\n\n| Metric | Value |\n| --- | --- |\n| ALPHA | 25% |\n| label\\|one | `a|b` |",
  );
  assert.equal(blocks[0].kind, "code");
  assert.equal(blocks[0].text, "<script>bad()</script>");
  assert.deepEqual(blocks[1].rows, [
    ["ALPHA", "25%"],
    ["label|one", "`a|b`"],
  ]);
  assert.equal(markdownBlocks("```js\nconst x = 1;")[0].text, "const x = 1;");
  const malformed = "| A | B |\n| --- | --- |\n| 25% |";
  assert.equal(markdownBlocks(malformed)[0].text, malformed);
});
test("untrusted Markdown cannot introduce executable links or automatic image requests", () => {
  for (const link of [
    "javascript:alert(1)",
    "data:text/html,bad",
    "file:///C:/secret",
    "https://example.com/\u0000",
  ])
    assert.equal(safeHref(link), null);
  assert.equal(
    safeHref("https://example.com/research"),
    "https://example.com/research",
  );
  assert.equal(
    inlineParts("![remote](https://example.invalid/tracker.png)")[0].kind,
    "text",
  );
  assert.equal(inlineParts("[bad](javascript:alert)")[0].kind, "text");
  assert.equal(
    markdownBlocks("<img src=x onerror=bad()>")[0].kind,
    "paragraph",
  );
});
