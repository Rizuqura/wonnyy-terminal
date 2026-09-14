const test = require("node:test");
const assert = require("node:assert/strict");
const { readChatStream } = require("./ollama-stream.cjs");
const { OllamaProvider } = require("./ollama-provider.cjs");
const { DEFAULTS } = require("../model-registry.cjs");

function response(text, split = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < bytes.length; index += split)
          controller.enqueue(bytes.slice(index, index + split));
        controller.close();
      },
    }),
  );
}

test("NDJSON stream survives byte boundaries and ignores separate thinking", async () => {
  const events = [
    {
      done: false,
      message: { content: '{"answer":"', thinking: "secret planning" },
    },
    { done: false, message: { content: "Café 😀." } },
    {
      done: true,
      done_reason: "stop",
      model: "test",
      message: { content: '"}' },
    },
  ];
  let last;
  const result = await readChatStream(
    response(events.map((event) => JSON.stringify(event)).join("\n")),
    (value) => {
      last = value;
    },
    () => {},
  );
  assert.equal(last, '{"answer":"Café 😀."}');
  assert.equal(result.message.thinking, undefined);
  assert.equal(result.message.content, last);
});

test("malformed, errored, and premature streams never succeed", async () => {
  for (const value of [
    "not JSON\n",
    '{"error":"model crashed"}\n',
    '{"done":false,"message":{"content":"partial"}}\n',
    '{"done":true,"message":{}}\n',
  ])
    await assert.rejects(
      readChatStream(
        response(value),
        () => {},
        () => {},
      ),
    );
});

test("stream inactivity timeout and cancellation are distinct", async () => {
  const provider = new OllamaProvider({
    fetchImpl: async (_, options) =>
      new Response(
        new ReadableStream({
          start(controller) {
            options.signal.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
          },
        }),
      ),
  });
  const request = {
    settings: { ...DEFAULTS, loadTimeoutMs: 20, inactivityTimeoutMs: 20 },
  };
  await assert.rejects(provider.streamChat({}, request), {
    code: "MODEL_TIMEOUT",
  });
  const controller = new AbortController();
  const pending = provider.streamChat(
    {},
    { settings: DEFAULTS, signal: controller.signal },
  );
  controller.abort();
  await assert.rejects(pending, { code: "MODEL_CANCELLED" });
});

test("slow prompt evaluation and hidden streaming do not time out an active answer", async () => {
  let payload;
  let visibleUpdates = 0;
  const provider = new OllamaProvider({
    fetchImpl: async (_, options) => {
      payload = JSON.parse(options.body);
      return new Response(
        new ReadableStream({
          start(controller) {
            const timers = [];
            options.signal.addEventListener(
              "abort",
              () => {
                timers.forEach(clearTimeout);
                controller.error(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
            const events = [
              { done: false, message: { content: '{"answer":"' } },
              { done: false, message: { content: "Done." } },
              { done: true, model: "local", message: { content: '"}' } },
            ];
            events.forEach((event, index) =>
              timers.push(
                setTimeout(
                  () => {
                    controller.enqueue(
                      new TextEncoder().encode(JSON.stringify(event) + "\n"),
                    );
                    if (event.done) controller.close();
                  },
                  160 + index * 30,
                ),
              ),
            );
          },
        }),
      );
    },
  });
  const result = await provider.complete({
    model: "local",
    messages: [{ role: "user", content: "Question" }],
    settings: {
      ...DEFAULTS,
      streaming: false,
      loadTimeoutMs: 1000,
      inactivityTimeoutMs: 100,
    },
    onContent: () => visibleUpdates++,
  });
  assert.equal(payload.stream, true);
  assert.equal(visibleUpdates, 0);
  assert.equal(result.content, '{"answer":"Done."}');
});

test("after first data a stalled stream uses inactivity, not the prompt allowance", async () => {
  const provider = new OllamaProvider({
    fetchImpl: async (_, options) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                '{"done":false,"message":{"content":"partial"}}\n',
              ),
            );
            options.signal.addEventListener(
              "abort",
              () => controller.error(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          },
        }),
      ),
  });
  await assert.rejects(
    provider.streamChat(
      {},
      {
        settings: { ...DEFAULTS, loadTimeoutMs: 1000, inactivityTimeoutMs: 20 },
      },
    ),
    (error) =>
      error.code === "MODEL_TIMEOUT" &&
      error.details.phase === "generation" &&
      error.details.timeoutMs === 20,
  );
});

test("repair keeps thinking disabled even for capable models", async () => {
  for (const thinking of [true, false]) {
    let payload;
    const provider = new OllamaProvider({
      fetchImpl: async (url, options) => {
        if (url.endsWith("/api/show"))
          return Response.json({
            capabilities: thinking
              ? ["completion", "thinking"]
              : ["completion"],
          });
        payload = JSON.parse(options.body);
        return Response.json({
          done: true,
          done_reason: "stop",
          model: "local",
          message: {
            content: '{"answer":"Done."}',
            thinking: "Hidden reasoning",
          },
        });
      },
    });
    await provider.describeModel("local");
    const result = await provider.complete({
      model: "local",
      messages: [{ role: "user", content: "Question" }],
      settings: { ...DEFAULTS, streaming: false },
      answerRepair: true,
    });
    assert.equal(payload.think, false);
    assert.equal(result.content, '{"answer":"Done."}');
    assert.equal(result.diagnostics.reasoningEnabled, false);
    assert.equal(result.thinking, undefined);
  }
});

test("terminal event completes without waiting for HTTP EOF", async () => {
  let cancelled = false;
  const stream = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            '{"done":true,"message":{"content":"Done."}}\n',
          ),
        );
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  const result = await readChatStream(stream);
  assert.equal(result.message.content, "Done.");
  assert.equal(cancelled, true);
});

test("thinking-only traffic cannot extend the answer progress deadline", async () => {
  const provider = new OllamaProvider({
    fetchImpl: async (_, options) =>
      new Response(
        new ReadableStream({
          start(controller) {
            const timer = setInterval(
              () =>
                controller.enqueue(
                  new TextEncoder().encode(
                    '{"done":false,"message":{"content":"","thinking":"more"}}\n',
                  ),
                ),
              5,
            );
            options.signal.addEventListener(
              "abort",
              () => {
                clearInterval(timer);
                controller.error(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          },
        }),
      ),
  });
  await assert.rejects(
    provider.streamChat(
      {},
      {
        settings: { ...DEFAULTS, loadTimeoutMs: 40, inactivityTimeoutMs: 20 },
      },
    ),
    { code: "MODEL_TIMEOUT" },
  );
});
