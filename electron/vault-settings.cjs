const path = require("node:path");
const fs = require("node:fs/promises");
const { readJson, writeJson } = require("./ai/json-store.cjs");
const { z, parse } = require("./ai/schemas.cjs");
const schema = z
  .object({
    schemaVersion: z.literal(1),
    vaultPath: z.string().min(1).max(32768),
  })
  .strict();
const file = (directory) => path.join(directory, "vault-settings.json");
async function initializeVault(directory, documents, override) {
  if (override) return path.resolve(override);
  const saved = await readJson(
    file(directory),
    (value) => parse(schema, value),
    null,
  );
  if (saved) return saved.vaultPath;
  const vault = path.join(documents, "QTerminal Vault");
  await fs.mkdir(vault, { recursive: true });
  return vault;
}
async function saveVault(directory, vaultPath) {
  const value = parse(schema, {
    schemaVersion: 1,
    vaultPath: path.resolve(vaultPath),
  });
  await writeJson(file(directory), value);
}
module.exports = { initializeVault, saveVault };
