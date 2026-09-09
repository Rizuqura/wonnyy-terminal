// Synthetic transports for the dedicated hidden Electron test entry only.
function createOnlineSmokeFetch() {
  const state = {
    requests: [],
    status: 200,
    nvidiaModelStatuses: {},
    checkDelayMs: 0,
  };
  const fetchImpl = async (url, init = {}) => {
    const endpoint = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    if (endpoint.hostname === "integrate.api.nvidia.com") {
      if (init.headers.Authorization !== "Bearer nvapi-synthetic-smoke-key")
        return new Response("Invalid key", { status: 401 });
      if (!body)
        return Response.json({
          data: [
            { id: "nvidia/nemotron-smoke" },
            { id: "deepseek-ai/deepseek-smoke" },
          ],
        });
      state.requests.push(body);
      if (state.nvidiaModelStatuses[body.model])
        return new Response("Unavailable", {
          status: state.nvidiaModelStatuses[body.model],
        });
      if (state.status !== 200)
        return new Response("Provider error", { status: state.status });
      const probe = body.messages[0].content.includes("NVIDIA ONLINE");
      const source = probe ? null : JSON.parse(body.messages[1].content);
      if (source?.sourceId === "wonnyy-model-check" && state.checkDelayMs) {
        await new Promise((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(init.signal.reason);
          };
          const timer = setTimeout(() => {
            init.signal.removeEventListener("abort", abort);
            resolve();
          }, state.checkDelayMs);
          init.signal.addEventListener("abort", abort, { once: true });
        });
      }
      const answer = probe
        ? "NVIDIA ONLINE"
        : source.sourceId === "wonnyy-model-check"
          ? "40%"
          : source.content.includes("ALPHA")
            ? "ALPHA allocation is 25%."
            : "BETA allocation is 40%.";
      const events = [
        {
          choices: [
            {
              delta: { reasoning_content: "Hidden reasoning" },
              finish_reason: null,
            },
          ],
        },
        {
          model: body.model,
          choices: [
            {
              delta: { content: answer },
              finish_reason: "stop",
            },
          ],
        },
      ];
      return new Response(
        events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (endpoint.hostname === "generativelanguage.googleapis.com") {
      if (init.headers["x-goog-api-key"] !== "AQ.synthetic-smoke-key")
        return Response.json(
          { error: { message: "API_KEY_INVALID" } },
          { status: 400 },
        );
      if (!body)
        return Response.json({
          models: [
            {
              name: "models/gemini-smoke",
              displayName: "Gemini Smoke",
              supportedGenerationMethods: ["generateContent"],
              inputTokenLimit: 32768,
              outputTokenLimit: 8192,
            },
          ],
        });
      state.requests.push(body);
      if (state.status !== 200)
        return new Response("Provider error", {
          status: state.status,
          headers: { "retry-after": "1" },
        });
      const source = JSON.parse(body.contents[0].parts[0].text);
      const answer =
        source.sourceId === "wonnyy-model-check"
          ? "40%"
          : source.content.includes("ALPHA")
            ? "ALPHA allocation is 25%."
            : "BETA allocation is 40%.";
      const encoded = JSON.stringify({ answer });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            const event = (text, finishReason) =>
              encoder.encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }], modelVersion: "gemini-smoke-001" })}\n\n`,
              );
            controller.enqueue(event(encoded.slice(0, -2)));
            const timer = setTimeout(() => {
              controller.enqueue(event(encoded.slice(-2), "STOP"));
              controller.close();
            }, 250);
            init.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                controller.error(init.signal.reason);
              },
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    if (endpoint.hostname !== "127.0.0.1")
      throw new Error("Unexpected test destination");
    if (endpoint.pathname === "/api/tags")
      return Response.json({ models: [{ name: "qwen3:4b", size: 1000 }] });
    if (endpoint.pathname === "/api/show")
      return Response.json({
        capabilities: ["completion"],
        model_info: { "test.context_length": 32768 },
      });
    if (endpoint.pathname === "/api/generate")
      return Response.json({ done: true });
    return new Response(
      JSON.stringify({
        model: body.model,
        done: true,
        done_reason: "stop",
        message: { content: '{"answer":"ALPHA allocation is 25%."}' },
      }) + "\n",
      { headers: { "content-type": "application/x-ndjson" } },
    );
  };
  return { state, fetchImpl };
}
module.exports = { createOnlineSmokeFetch };
