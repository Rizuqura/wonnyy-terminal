const { _electron: electron } = require("playwright");
const fs = require("node:fs/promises"),
  path = require("node:path"),
  os = require("node:os");
const assert = require("node:assert/strict");

async function main() {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "qterminal-front-office-ui-"),
  );
  const artifacts = path.resolve("test-results/front-office");
  await fs.mkdir(artifacts, { recursive: true });
  let app;
  const errors = [];
  try {
    const env = {
      ...process.env,
      WONNYY_VAULT_PATH: root,
      WONNYY_SMOKE_DATA: path.join(root, ".wonnyy", "app-data"),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_START_URL;
    app = await electron.launch({
      args: [
        path.resolve("scripts/electron-front-office-smoke-main.cjs"),
        "--hidden",
      ],
      env,
      timeout: 30000,
    });
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 1440, height: 1000 });
    page.setDefaultTimeout(20000);
    page.on("pageerror", (e) => errors.push(e.message));
    await page.locator(".startup-screen").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "SETTINGS", exact: true }).click();
    await page.getByText("LLM Backend / Front Office", { exact: true }).click();
    await page.evaluate(async () => {
      await window.wonnyyDesktop.ai.saveCredential({
        providerId: "openrouter",
        apiKey: "synthetic-front-office-key",
      });
    });
    await page
      .getByRole("button", {
        name: "Refresh OpenRouter capabilities",
        exact: true,
      })
      .click();
    const catalog = page.getByRole("region", {
      name: "Capability model catalog",
    });
    await catalog
      .getByRole("button", { name: "Inspect vendor/alpha", exact: true })
      .waitFor();
    await page.getByLabel("Enable experimental chat", { exact: true }).check();
    await page
      .getByLabel("Experimental model", { exact: true })
      .selectOption("openrouter:vendor/alpha");
    await page
      .getByRole("button", { name: "Save backend settings", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "New experiment / reset history",
        exact: true,
      })
      .click();
    const send = async (text) => {
      const before = await page.evaluate(
        async () =>
          (await window.wonnyyDesktop.ai.frontOfficeList())[0]?.attempts
            .length ?? 0,
      );
      await page.getByLabel("Experiment question", { exact: true }).fill(text);
      await page
        .getByRole("button", { name: "Send experiment", exact: true })
        .click();
      await page.waitForFunction(async (count) => {
        const list = await window.wonnyyDesktop.ai.frontOfficeList();
        return (
          list[0]?.attempts.length === count + 1 &&
          list[0]?.attempts.at(-1)?.status === "succeeded"
        );
      }, before);
    };
    await send("Reply with a synthetic fixture answer.");
    await page
      .getByLabel("Experiment messages")
      .getByText("FRONT OFFICE OK", { exact: true })
      .waitFor();
    let captured = await app.evaluate(
      () => globalThis.frontOfficeSmoke.requests,
    );
    assert.deepEqual(captured[0].body.messages, [
      { role: "user", content: "Reply with a synthetic fixture answer." },
    ]);
    assert.equal(captured[0].body.model, "vendor/alpha");
    await send("A second turn includes the complete experiment history.");
    captured = await app.evaluate(() => globalThis.frontOfficeSmoke.requests);
    assert.equal(captured.at(-1).body.messages.length, 3);
    await page
      .getByLabel("Catalog capability", { exact: true })
      .selectOption("vision");
    assert.equal(
      await catalog.getByRole("button", { name: /^Inspect / }).count(),
      1,
    );
    await page
      .getByLabel("Catalog capability", { exact: true })
      .selectOption("all");
    await page
      .getByLabel("Catalog sort", { exact: true })
      .selectOption("price");
    assert.match(
      await catalog.locator("tbody tr").first().innerText(),
      /Beta text/,
    );
    await page
      .getByLabel("Catalog sample budget USD", { exact: true })
      .fill("0");
    assert.equal(
      await catalog.getByRole("button", { name: /^Inspect / }).count(),
      1,
    );
    await page
      .getByLabel("Catalog sample budget USD", { exact: true })
      .fill("");
    await catalog
      .getByRole("button", { name: "Inspect vendor/alpha", exact: true })
      .click();
    await page
      .getByLabel("Model override JSON", { exact: true })
      .fill('{"contextTokens":65536,"structuredOutput":true}');
    await page
      .getByRole("button", { name: "Apply model override", exact: true })
      .click();
    await page
      .getByRole("region", { name: "Model detail inspector" })
      .getByText("local-override", { exact: true })
      .waitFor();
    await catalog.screenshot({
      path: path.join(artifacts, "capability-catalog.png"),
    });
    await app.evaluate(() => {
      globalThis.frontOfficeSmoke.mode = "partial-failure";
    });
    await page
      .getByLabel("Experiment question", { exact: true })
      .fill("Try a bounded partial failure.");
    await page
      .getByRole("button", { name: "Send experiment", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: /server error/ })
      .waitFor();
    const failedCount = (
      await app.evaluate(() => globalThis.frontOfficeSmoke.requests)
    ).length;
    await app.evaluate(() => {
      globalThis.frontOfficeSmoke.mode = "success";
    });
    await page
      .getByRole("button", { name: "Retry failed turn", exact: true })
      .click();
    await page.waitForFunction(async () => {
      const c = (await window.wonnyyDesktop.ai.frontOfficeList())[0];
      return c.attempts.at(-1).status === "succeeded";
    });
    assert.equal(
      (await app.evaluate(() => globalThis.frontOfficeSmoke.requests)).length,
      failedCount + 1,
    );
    const conversation = await page.evaluate(
      async () => (await window.wonnyyDesktop.ai.frontOfficeList())[0],
    );
    assert.equal(
      conversation.messages.filter((m) => m.role === "user").length,
      3,
    );
    await page
      .getByLabel("Experiment question", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(artifacts, "experimental-chat.png"),
    });
    // Exercise the authenticated loopback adapter with a mocked gateway, explicitly
    // not claiming this fixture server is a real LiteLLM performance result.
    await page.evaluate(async () => {
      const ai = window.wonnyyDesktop.ai;
      await ai.saveCredential({
        providerId: "litellm",
        apiKey: "synthetic-local-gateway-key",
      });
      const { config } = await ai.frontOfficeState();
      config.gateway.enabled = true;
      await ai.frontOfficeConfig(config);
      const c = await ai.frontOfficeCreate();
      const result = await ai.frontOfficeChat({
        conversationId: c.id,
        requestId: crypto.randomUUID(),
        userMessage: "Gateway fixture parity",
        transport: "litellm",
      });
      if (result.run.diagnostics.frontOffice.mode !== "experiment")
        throw Error("Missing trace");
    });
    captured = await app.evaluate(() => globalThis.frontOfficeSmoke.requests);
    assert.equal(captured.at(-1).transport, "litellm-fixture");
    assert.equal(captured.at(-1).body.model, "openrouter/vendor/alpha");
    const exported = await page.evaluate(() =>
      window.wonnyyDesktop.ai.frontOfficeExport("json"),
    );
    assert.doesNotMatch(
      exported,
      /synthetic-front-office-key|synthetic-local-gateway-key|Reply with a synthetic|PRIVATE_ERROR_BODY/,
    );
    await page
      .getByText("Advanced tuning and gateway", { exact: true })
      .click();
    await page
      .getByLabel("Advanced backend configuration", { exact: true })
      .fill('{"PRIVATE_JSON_INPUT":');
    await page
      .getByRole("button", {
        name: "Apply advanced configuration",
        exact: true,
      })
      .click();
    const invalidJsonAlert = page
      .getByRole("alert")
      .filter({ hasText: "Invalid JSON" });
    await invalidJsonAlert.waitFor();
    assert.doesNotMatch(
      await invalidJsonAlert.innerText(),
      /PRIVATE_JSON_INPUT/,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: isolated Electron experiment UI, no context/persona prompt, complete history, capability filters/sorts/budget, overrides, partial-stream retry, encrypted gateway key, mocked gateway adapter and privacy-safe metrics. No live inference or real LiteLLM measurement.",
    );
  } finally {
    if (app) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
