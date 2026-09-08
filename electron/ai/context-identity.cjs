const { createHash } = require("node:crypto");
const { ModelRuntimeError } = require("./model-errors.cjs");

function contextIdentity(scope) {
  const source = scope?.sources?.[0];
  if (
    scope?.mode !== "active-context" ||
    scope.sources.length !== 1 ||
    !["md", "markdown"].includes(source?.type) ||
    source.missing ||
    source.changed ||
    !/^[a-f0-9]{64}$/.test(source.contentHash ?? "")
  ) {
    throw new ModelRuntimeError(
      "MODEL_CONTEXT_INVALID",
      "Approve one available, unchanged Markdown file in Active Context.",
    );
  }
  const sources = [
    {
      sourceId: source.id,
      relativePath: source.relativePath,
      contentHash: source.contentHash,
    },
  ];
  return {
    id: createHash("sha256")
      .update(JSON.stringify({ mode: scope.mode, sources }))
      .digest("hex"),
    mode: scope.mode,
    sources,
  };
}

function validateContextIdentity(value) {
  const source = value?.sources?.[0];
  const expected = contextIdentity({
    mode: value?.mode,
    sources: (value?.sources ?? []).map((item) => ({
      id: item.sourceId,
      relativePath: item.relativePath,
      contentHash: item.contentHash,
      type: "md",
    })),
  });
  if (
    !source ||
    typeof source.sourceId !== "string" ||
    typeof source.relativePath !== "string" ||
    expected.id !== value.id
  ) {
    throw new ModelRuntimeError(
      "MODEL_STORAGE_INVALID",
      "Stored source identity does not match its source references.",
    );
  }
  return expected;
}

module.exports = { contextIdentity, validateContextIdentity };
