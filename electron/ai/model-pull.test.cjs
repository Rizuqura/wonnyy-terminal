const test = require("node:test");
const assert = require("node:assert/strict");
const { ModelPullService } = require("./model-pull.cjs");
const { OllamaProvider } = require("./providers/ollama-provider.cjs");

test("one authoritative pull per model, including aliases; completion is installed, not loaded", async () => {
  let finish,
    calls = 0;
  const events = [];
  const service = new ModelPullService(
    {
      pull: async (_model, _signal, progress) => {
        calls++;
        progress({
          message: "pulling layer",
          progress: { current: 20, total: 100, unit: "layer bytes" },
        });
        await new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    (event) => events.push(event),
  );
  const first = service.start("qwen3", 1);
  assert.equal(service.start("qwen3:latest", 2), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(service.list()[0].progress.current, 20);
  assert.throws(() => service.start("other", 1), { code: "MODEL_BUSY" });
  finish();
  assert.equal((await first).phase, "model-installed");
  await service.start("qwen3", 1);
  assert.equal(calls, 1);
  assert.equal(events.at(-1).phase, "model-installed");
});

test("only the owner cancels a pull; cancellation never retries", async () => {
  let calls = 0;
  const service = new ModelPullService({
    pull: async (_model, signal) => {
      calls++;
      await new Promise((resolve) =>
        signal.addEventListener("abort", resolve, { once: true }),
      );
      signal.throwIfAborted();
    },
  });
  const pending = service.start("qwen3:4b", 1);
  await Promise.resolve();
  await service.cancel("qwen3:4b", 2);
  assert.equal(service.list()[0].phase, "model-pulling");
  await service.cancel("qwen3:4b", 1);
  assert.equal((await pending).phase, "cancelled");
  assert.equal(calls, 1);
});

test("pull errors remain visible and retry requires explicit action", async () => {
  let calls = 0;
  const service = new ModelPullService({
    pull: async () => {
      calls++;
      throw new Error("failure");
    },
  });
  assert.equal((await service.start("qwen3:4b", 1)).phase, "error");
  assert.equal(calls, 1);
  await service.start("qwen3:4b", 1);
  assert.equal(calls, 2);
  assert.throws(() => service.start("../invalid", 1), {
    code: "MODEL_INVALID_REQUEST",
  });
});

test("Ollama pull consumes real NDJSON progress and requires a success event", async () => {
  for (const success of [true, false]) {
    const events = [];
    const provider = new OllamaProvider({
      fetchImpl: async (url, init) => {
        assert.ok(url.endsWith("/api/pull"));
        assert.deepEqual(JSON.parse(init.body), {
          model: "qwen3:4b",
          stream: true,
        });
        return new Response(
          '{"status":"pulling manifest"}\n{"status":"pulling layer","completed":25,"total":100}\n' +
            (success ? '{"status":"success"}\n' : ""),
        );
      },
    });
    const operation = provider.pull(
      "qwen3:4b",
      new AbortController().signal,
      (event) => events.push(event),
    );
    if (success) await operation;
    else await assert.rejects(operation, /before completion/);
    assert.equal(events[0].progress, undefined);
    assert.deepEqual(events[1].progress, {
      current: 25,
      total: 100,
      unit: "layer bytes",
    });
  }
});
