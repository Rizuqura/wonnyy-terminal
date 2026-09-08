const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const {
  readPdfFile,
  readVaultFile,
  scanVault,
  searchPdfText,
} = require("./vault-service.cjs");
const stations = require("./station-service.cjs");
const { serializeBrainError } = require("./brain-errors.cjs");
const { OllamaProvider } = require("./ai/providers/ollama-provider.cjs");
const { ChatService } = require("./ai/chat-service.cjs");
const { ModelRegistry } = require("./ai/model-registry.cjs");
const { registerAiIpc } = require("./ai/ipc.cjs");
const { ModelRuntimeError } = require("./ai/model-errors.cjs");

const isDevelopment = Boolean(process.env.ELECTRON_START_URL);
let activeVaultPath =
  process.env.WONNYY_VAULT_PATH ||
  (process.platform === "win32" ? "C:\\bank" : "/bank");
let ollamaProvider;
let chatService;

function getOllamaProvider() {
  ollamaProvider ??= new OllamaProvider();
  return ollamaProvider;
}

function getVaultSnapshot() {
  return scanVault(activeVaultPath);
}

function changeVaultKnowledge(operation) {
  const vaultPath = activeVaultPath;
  return chatService.changeKnowledge(() => {
    if (vaultPath !== activeVaultPath)
      throw new ModelRuntimeError(
        "MODEL_CONTEXT_INVALID",
        "The active vault changed before this operation started. Retry in the current vault.",
      );
    return operation(vaultPath);
  });
}

async function selectVaultFolder() {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: "Select Wonnyy knowledge vault",
    defaultPath: activeVaultPath,
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return chatService.changeKnowledge(() => {
    activeVaultPath = result.filePaths[0];
    return getVaultSnapshot();
  });
}

async function brainOperation(operation) {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: serializeBrainError(error) };
  }
}

function createWindow() {
  const window = new BrowserWindow({
    show: !app.commandLine.hasSwitch("hidden"),
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0d0e",
    title: "Wonnyy — Amadeus",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.on("destroyed", () => {
    void chatService?.cancelAll();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url);
    }

    return { action: "deny" };
  });

  if (isDevelopment) {
    window.loadURL(process.env.ELECTRON_START_URL);
  } else {
    window.loadFile(path.join(__dirname, "..", "out", "index.html"));
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.wonnyy.amadeus");
  ipcMain.handle("vault:getSnapshot", getVaultSnapshot);
  ipcMain.handle("vault:rescan", () => changeVaultKnowledge(scanVault));
  ipcMain.handle("vault:selectFolder", selectVaultFolder);
  ipcMain.handle("vault:read", (_, relativePath) =>
    readVaultFile(activeVaultPath, relativePath),
  );
  ipcMain.handle("vault:readPdf", (_, relativePath) =>
    readPdfFile(activeVaultPath, relativePath),
  );
  ipcMain.handle("vault:search", (_, query) =>
    searchPdfText(activeVaultPath, query),
  );
  ipcMain.handle("stations:getState", () =>
    stations.getStationState(activeVaultPath),
  );
  ipcMain.handle("stations:create", (_, name) =>
    stations.createStation(activeVaultPath, name),
  );
  ipcMain.handle("stations:rename", (_, id, name) =>
    stations.renameStation(activeVaultPath, id, name),
  );
  ipcMain.handle("stations:delete", (_, id) =>
    stations.deleteStation(activeVaultPath, id),
  );
  ipcMain.handle("stations:setAssignments", (_, paths, stationId, assigned) =>
    stations.setAssignments(activeVaultPath, paths, stationId, assigned),
  );
  ipcMain.handle("stations:suggestions", () =>
    stations.suggestReattachments(activeVaultPath),
  );
  ipcMain.handle("stations:reattach", (_, fromPath, toPath) =>
    stations.reattach(activeVaultPath, fromPath, toPath),
  );
  ipcMain.handle("context:preview", (_, paths) =>
    stations.previewContext(activeVaultPath, paths),
  );
  ipcMain.handle("context:add", (_, paths) =>
    changeVaultKnowledge((vaultPath) => stations.addContext(vaultPath, paths)),
  );
  ipcMain.handle("context:remove", (_, paths) =>
    changeVaultKnowledge((vaultPath) =>
      stations.removeContext(vaultPath, paths),
    ),
  );
  ipcMain.handle("context:clear", () =>
    changeVaultKnowledge((vaultPath) => stations.clearContext(vaultPath)),
  );
  ipcMain.handle("context:buildPackage", () =>
    stations.buildContextPackage(activeVaultPath),
  );
  ipcMain.handle("brain:prepareScope", (_, input) =>
    brainOperation(() => stations.prepareBrainScope(activeVaultPath, input)),
  );
  ipcMain.handle("brain:readSource", (_, input) =>
    brainOperation(() => stations.readBrainSource(activeVaultPath, input)),
  );
  const provider = getOllamaProvider();
  const registry = new ModelRegistry(provider, app.getPath("userData"));
  chatService = new ChatService({ provider, registry });
  registerAiIpc({
    ipcMain,
    getVault: () => activeVaultPath,
    service: chatService,
    registry,
    provider,
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
