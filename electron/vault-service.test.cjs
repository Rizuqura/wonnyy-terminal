const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { cmapPdf } = require("../scripts/fixtures/cmap-pdf.cjs");
const { MAX_PDF_BYTES, readPdfFile, readVaultFile, resolveVaultFile, scanVault, searchPdfText } = require("./vault-service.cjs");

async function withVault(run) {
  const vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "wonnyy-vault-"));
  try { await run(vaultPath); } finally { await fs.rm(vaultPath, { recursive: true, force: true }); }
}

function minimalPdf(text) {
  const stream = `BT\n/F1 18 Tf\n72 720 Td\n(${text.replace(/[()\\]/g, "\\$&")}) Tj\nET`;
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < bodies.length; index += 1) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${bodies[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document);
  document += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  document += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  document += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(document, "binary");
}

test("scanVault recursively returns supported files and folders", async () => {
  await withVault(async (vaultPath) => {
    await fs.mkdir(path.join(vaultPath, "research"));
    await fs.writeFile(path.join(vaultPath, "research", "note.md"), "# Note");
    await fs.writeFile(path.join(vaultPath, "data.csv"), "name\nWonnyy");
    await fs.writeFile(path.join(vaultPath, "report.pdf"), minimalPdf("Revenue outlook"));
    await fs.writeFile(path.join(vaultPath, "image.png"), "not indexed");
    const snapshot = await scanVault(vaultPath);
    assert.equal(snapshot.status, "ready");
    assert.equal(snapshot.totalFiles, 3);
    assert.equal(snapshot.totalDirectories, 1);
    const image = snapshot.entries.find((entry) => entry.name === "image.png");
    assert.equal(image?.readable, false);
    const report = snapshot.entries.find((entry) => entry.name === "report.pdf");
    assert.equal(report?.pdf?.textStatus, "ready");
    assert.equal(searchPdfText(vaultPath, "revenue")[0]?.matchCount, 1);
    await fs.writeFile(path.join(vaultPath, "report.pdf"), minimalPdf("Margin outlook"));
    await scanVault(vaultPath);
    assert.equal(searchPdfText(vaultPath, "revenue").length, 0);
    assert.equal(searchPdfText(vaultPath, "margin")[0]?.matchCount, 1);
    await fs.unlink(path.join(vaultPath, "report.pdf"));
    await scanVault(vaultPath);
    assert.equal(searchPdfText(vaultPath, "margin").length, 0);
  });
});

test("readVaultFile stays inside the vault and PDF reads are binary", async () => {
  await withVault(async (vaultPath) => {
    await fs.writeFile(path.join(vaultPath, "note.md"), "# Safe");
    await fs.writeFile(path.join(vaultPath, "report.pdf"), minimalPdf("Binary PDF"));
    const file = await readVaultFile(vaultPath, "note.md");
    const pdf = await readPdfFile(vaultPath, "report.pdf");
    assert.equal(file.content, "# Safe");
    assert.equal(pdf.data instanceof Uint8Array, true);
    assert.throws(() => resolveVaultFile(vaultPath, "..\\outside.md"), /outside the active vault/);
  });
});

test("PDFs above the configured limit are visible but cannot be read or indexed", async () => {
  await withVault(async (vaultPath) => {
    const largePdfPath = path.join(vaultPath, "large.pdf");
    const handle = await fs.open(largePdfPath, "w");
    await handle.truncate(MAX_PDF_BYTES + 1);
    await handle.close();
    const snapshot = await scanVault(vaultPath);
    assert.equal(snapshot.entries[0]?.pdf?.textStatus, "too-large");
    await assert.rejects(() => readPdfFile(vaultPath, "large.pdf"), /100 MB/);
  });
});

test("overlapping scans share work and keep same-named PDFs isolated by vault", async () => {
  await withVault(async (alpha) => withVault(async (beta) => {
    await fs.writeFile(path.join(alpha, "report.pdf"), minimalPdf("ALPHA research"));
    await fs.writeFile(path.join(beta, "report.pdf"), minimalPdf("BETA research"));
    const first = scanVault(alpha);
    assert.equal(scanVault(alpha), first, "Concurrent callers must share the same scan");
    const [a, b] = await Promise.all([first, scanVault(beta)]);
    assert.equal(a.entries[0].pdf.textStatus, "ready");
    assert.equal(b.entries[0].pdf.textStatus, "ready");
    assert.equal(searchPdfText(alpha, "ALPHA").length, 1);
    assert.equal(searchPdfText(alpha, "BETA").length, 0);
    assert.equal(searchPdfText(beta, "BETA").length, 1);
    assert.equal(searchPdfText(beta, "ALPHA").length, 0);
    await fs.writeFile(path.join(alpha, "updated.md"), "Fresh scan");
    assert.equal((await scanVault(alpha)).totalFiles, 2, "Completed snapshots must not be cached indefinitely");
  }));
});

test("PDF indexing loads local character maps for non-embedded composite fonts", async () => {
  await withVault(async (vaultPath) => {
    await fs.writeFile(path.join(vaultPath, "mapped.pdf"), cmapPdf());
    const snapshot = await scanVault(vaultPath);
    assert.equal(snapshot.entries[0].pdf.textStatus, "ready");
    assert.equal(searchPdfText(vaultPath, "日本").length, 1);
    assert.deepEqual(snapshot.issues, []);
  });
});
