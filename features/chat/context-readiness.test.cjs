const assert = require("node:assert/strict");
const test = require("node:test");
const { chatErrorMessage } = require("./context-readiness.ts");

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
