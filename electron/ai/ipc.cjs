const {
  ModelRuntimeError,
  serializeModelError,
} = require("./model-errors.cjs");
const {
  z,
  parse,
  parseCredential,
  credentialProvider,
} = require("./schemas.cjs");
const { checkRemoteModel } = require("./model-check.cjs");
const { ModelPullService } = require("./model-pull.cjs");
const { OpenRouterUsageService } = require("./openrouter-usage.cjs");
const API_VERSION = 18;

function registerAiIpc({
  ipcMain,
  getVault,
  service,
  registry,
  provider,
  credentials,
  agents,
  chooseAvatar,
  chooseBackdrop,
  researchKnowledge,
}) {
  const compatible = new Set();
  const checks = new Map();
  const clients = new Map();
  const usage = new OpenRouterUsageService({ credentials, registry });
  const usageChanged = () => {
    for (const sender of clients.values())
      if (!sender.isDestroyed?.()) sender.send?.("ai:usageChanged");
  };
  const openrouter = registry?.providerFor?.("openrouter");
  if (openrouter)
    openrouter.onUsage = async (value, key) => {
      await usage.record(value, key);
      usageChanged();
    };
  const pulls = new ModelPullService(provider, (status) => {
    for (const sender of clients.values())
      if (!sender.isDestroyed()) sender.send("ai:pull", status);
  });
  ipcMain.handle("ai:handshake", (event, version) => {
    if (version === API_VERSION) {
      compatible.add(event.sender.id);
      if (!clients.has(event.sender.id)) {
        clients.set(event.sender.id, event.sender);
        event.sender.once?.("destroyed", () => {
          clients.delete(event.sender.id);
          compatible.delete(event.sender.id);
          pulls.cancelOwner(event.sender.id);
        });
      }
    } else {
      compatible.delete(event.sender.id);
      clients.delete(event.sender.id);
    }
    return { apiVersion: API_VERSION };
  });
  const handle = (name, operation) =>
    ipcMain.handle(`ai:${name}`, async (event, input) => {
      try {
        if (!compatible.has(event.sender.id))
          throw new ModelRuntimeError(
            "MODEL_RESTART_REQUIRED",
            "Restart QTerminal to load the matching desktop backend.",
          );
        return { ok: true, value: await operation(event, input) };
      } catch (error) {
        if (
          !(error instanceof ModelRuntimeError) &&
          error?.name !== "BrainScopeError"
        )
          console.error("Wonnyy runtime:", error);
        return { ok: false, error: serializeModelError(error) };
      }
    });
  handle("pullStatus", () => pulls.list());
  handle("pullModel", (event, model) => {
    service.assertIdle();
    return pulls.start(model, event.sender.id);
  });
  handle("cancelPull", (event, model) => {
    if (typeof model !== "string")
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "Invalid model name.",
      );
    return pulls.cancel(model, event.sender.id);
  });
  handle("getStatus", () => provider.getStatus());
  handle("openRouterUsage", (_, input) => {
    const options = parse(
      z.object({ refresh: z.boolean().optional() }).strict(),
      input ?? {},
    );
    return usage.get(options);
  });
  handle("listModels", () => provider.listModels());
  handle("testModel", (_, model) =>
    service.exclusive(() => provider.testModel(model)),
  );
  handle("models", () => registry.state());
  handle("getAgent", (_, id) => agents.get(id));
  handle("listAgents", () => agents.list());
  handle("createAgent", (_, input) =>
    service.exclusive(() => agents.create(input)),
  );
  handle("getVaultIdentity", async () => ({
    vaultPath: (await service.store(getVault())).root,
  }));
  handle("saveAgentConstruction", (_, input) =>
    service.saveConstruction(getVault(), input),
  );
  handle("previewConstructionBox", (_, input) =>
    service.exclusive(() => service.previewConstructionBox(getVault(), input)),
  );
  handle("listConstructionFiles", () =>
    service.exclusive(() => service.listConstructionFiles(getVault())),
  );
  handle("previewConstructionFile", (_, input) =>
    service.exclusive(() => service.previewConstructionFile(getVault(), input)),
  );
  if (researchKnowledge) {
    handle("proposeKnowledge", (_, input) =>
      service.exclusive(() => researchKnowledge.propose(getVault(), input)),
    );
    handle("retrieveKnowledge", (_, input) =>
      service.exclusive(() =>
        researchKnowledge.retrieve(getVault(), input, service),
      ),
    );
  }
  handle("saveAgent", (_, input) => agents.save(input));
  handle("chooseAgentAvatar", () => chooseAvatar());
  handle("chooseAgentBackdrop", (_, kind) =>
    chooseBackdrop(parse(z.enum(["banner", "wallpaper"]), kind)),
  );
  handle("checkRemoteModel", (event, input) => {
    const { providerId, model } = parse(
      z
        .object({
          providerId: z.enum(["gemini", "nvidia", "openrouter"]),
          model: z
            .string()
            .min(1)
            .max(200)
            .regex(/^~?[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
        })
        .strict(),
      input,
    );
    return service.exclusive(async () => {
      const controller = new AbortController();
      const abort = () =>
        controller.abort(
          new ModelRuntimeError("MODEL_CANCELLED", "Model check stopped."),
        );
      checks.set(event.sender.id, abort);
      event.sender.once?.("destroyed", abort);
      try {
        return await checkRemoteModel(
          registry.providerFor(providerId),
          providerId,
          model,
          controller.signal,
        );
      } finally {
        checks.delete(event.sender.id);
        event.sender.removeListener?.("destroyed", abort);
      }
    });
  });
  handle("stopModelChecks", (event) => {
    checks.get(event.sender.id)?.();
  });
  handle("checkNvidiaModel", (_, model) =>
    service.exclusive(() => registry.providerFor("nvidia").probe(model)),
  );
  handle("saveCredential", (_, input) =>
    service.exclusive(async () => {
      const value = await credentials.save(parseCredential(input));
      usage.invalidate();
      usageChanged();
      return value;
    }),
  );
  handle("removeCredential", (_, input) =>
    service.exclusive(async () => {
      const value = await credentials.remove(parse(credentialProvider, input));
      usage.invalidate();
      usageChanged();
      return value;
    }),
  );
  handle("settings", (_, input) =>
    service.exclusive(async () => {
      const value = await registry.save(input);
      usage.invalidate();
      usageChanged();
      return value;
    }),
  );
  handle("previewBoxSelection", (_, paths) =>
    service.previewBoxSelection(getVault(), paths),
  );
  handle("inspectContextBox", (_, id) => service.inspectBox(getVault(), id));
  handle("editContextBox", (_, input) => service.editBox(getVault(), input));
  handle("switchContextBox", (_, input) =>
    service.switchBox(getVault(), input),
  );
  handle("listContextBoxes", () => service.listBoxes(getVault()));
  handle("saveContextBox", (_, input) => service.saveBox(getVault(), input));
  handle("renameContextBox", (_, input) =>
    service.renameBox(getVault(), input),
  );
  handle("checkConversation", (_, id) =>
    service.checkConversation(getVault(), id),
  );
  handle("context", (_, input) => service.context(getVault(), input));
  handle("listConversations", () => service.list(getVault()));
  handle("createConversation", (_, input) => service.create(getVault(), input));
  handle("renameConversation", (_, input) => service.rename(getVault(), input));
  handle("deleteConversation", (_, id) => service.remove(getVault(), id));
  handle("clearConversations", () => service.clear(getVault()));
  handle("resumeConversation", (_, id) => service.resume(getVault(), id));
  handle("refreshSource", () => service.refreshSource(getVault()));
  handle("cancel", (event, id) => service.cancel(event.sender.id, id));
  handle("chat", (event, input) =>
    pulls.list().some((p) => p.phase === "model-pulling")
      ? Promise.reject(
          new ModelRuntimeError(
            "MODEL_BUSY",
            "A model is downloading. Finish or cancel the download first.",
          ),
        )
      : service.run(getVault(), event.sender.id, input, (value) => {
          if (!event.sender.isDestroyed()) event.sender.send("ai:event", value);
        }),
  );
}

module.exports = { API_VERSION, registerAiIpc };
