const assert = require("node:assert/strict");
const test = require("node:test");
const {
  chatErrorMessage,
  getChatUnavailableReason,
} = require("./context-readiness.ts");

const source = {
  id: "note.md",
  relativePath: "note.md",
  name: "note.md",
  type: "md",
  stations: [],
  estimatedTokens: 10,
  contentHash: "a".repeat(64),
  missing: false,
  changed: false,
};
const scope = {
  id: "scope",
  ownerId: "owner",
  mode: "active-context",
  reason: "Active Context",
  stationIds: [],
  stationNames: [],
  manifestVersion: "manifest",
  createdAt: "2026-09-03T00:00:00.000Z",
  expiresAt: "2026-09-03T00:05:00.000Z",
  estimatedTokens: 10,
  sources: [source],
};

test("chat enables only one available Active Context Markdown source", () => {
  const input = {
    vaultStatus: "ready",
    brainScope: scope,
    brainScopeBusy: false,
    brainScopeError: null,
  };
  assert.equal(getChatUnavailableReason(input), null);
  assert.match(
    getChatUnavailableReason({
      ...input,
      brainScope: { ...scope, mode: "universe" },
    }) ?? "",
    /Approve exactly one Markdown/,
  );
  assert.match(
    getChatUnavailableReason({
      ...input,
      brainScope: { ...scope, sources: [] },
    }) ?? "",
    /exactly one file/,
  );
  assert.match(
    getChatUnavailableReason({
      ...input,
      brainScope: { ...scope, sources: [{ ...source, type: "csv" }] },
    }) ?? "",
    /Markdown source only/,
  );
  assert.match(
    getChatUnavailableReason({
      ...input,
      brainScope: { ...scope, sources: [{ ...source, changed: true }] },
    }) ?? "",
    /missing or changed/,
  );
});

test("chat presents actionable structured runtime errors", () => {
  assert.match(
    chatErrorMessage(
      Object.assign(new Error("offline"), { code: "MODEL_OFFLINE" }),
    ),
    /Start Ollama/,
  );
  assert.match(
    chatErrorMessage(
      Object.assign(new Error("changed"), { code: "BRAIN_SOURCE_CHANGED" }),
    ),
    /Approved context/,
  );
  assert.match(
    chatErrorMessage(
      Object.assign(new Error("bad"), { code: "MODEL_INVALID_RESPONSE" }),
    ),
    /MODEL_INVALID_RESPONSE/,
  );
  assert.match(
    chatErrorMessage(
      Object.assign(new Error("cancelled"), { code: "MODEL_CANCELLED" }),
    ),
    /was stopped/,
  );
});
