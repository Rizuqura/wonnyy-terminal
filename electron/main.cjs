const { app, BrowserWindow, dialog, shell, ipcMain } = require("electron");
const path = require("path");
const { readPdfFile, readVaultFile, scanVault, searchPdfText } = require("./vault-service.cjs");
const stations = require("./station-service.cjs");

const isDevelopment = Boolean(process.env.ELECTRON_START_URL);
let activeVaultPath = process.env.WONNYY_VAULT_PATH || (process.platform === "win32" ? "C:\\bank" : "/bank");

function getVaultSnapshot() {
  return scanVault(activeVaultPath);
}

async function selectVaultFolder() {
  const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
    title: "Select Wonnyy knowledge vault",
    defaultPath: activeVaultPath,
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  activeVaultPath = result.filePaths[0];
  return getVaultSnapshot();
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0d0e",
    title: "Wonnyy — Amadeus",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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
  ipcMain.handle("vault:rescan", getVaultSnapshot);
  ipcMain.handle("vault:selectFolder", selectVaultFolder);
  ipcMain.handle("vault:read", (_, relativePath) => readVaultFile(activeVaultPath, relativePath));
  ipcMain.handle("vault:readPdf", (_, relativePath) => readPdfFile(activeVaultPath, relativePath));
  ipcMain.handle("vault:search", (_, query) => searchPdfText(activeVaultPath, query));
  ipcMain.handle("stations:getState", () => stations.getStationState(activeVaultPath));
  ipcMain.handle("stations:create", (_, name) => stations.createStation(activeVaultPath, name));
  ipcMain.handle("stations:rename", (_, id, name) => stations.renameStation(activeVaultPath, id, name));
  ipcMain.handle("stations:delete", (_, id) => stations.deleteStation(activeVaultPath, id));
  ipcMain.handle("stations:setAssignments", (_, paths, stationId, assigned) => stations.setAssignments(activeVaultPath, paths, stationId, assigned));
  ipcMain.handle("stations:suggestions", () => stations.suggestReattachments(activeVaultPath));
  ipcMain.handle("stations:reattach", (_, fromPath, toPath) => stations.reattach(activeVaultPath, fromPath, toPath));
  ipcMain.handle("context:preview", (_, paths) => stations.previewContext(activeVaultPath, paths));
  ipcMain.handle("context:add", (_, paths) => stations.addContext(activeVaultPath, paths));
  ipcMain.handle("context:remove", (_, paths) => stations.removeContext(activeVaultPath, paths));
  ipcMain.handle("context:clear", () => stations.clearContext(activeVaultPath));
  ipcMain.handle("context:buildPackage", () => stations.buildContextPackage(activeVaultPath));
  ipcMain.handle("brain:prepareScope", (_, input) => stations.prepareBrainScope(activeVaultPath, input));
  ipcMain.handle("brain:readSource", (_, scopeId, sourceId) => stations.readBrainSource(activeVaultPath, scopeId, sourceId));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
