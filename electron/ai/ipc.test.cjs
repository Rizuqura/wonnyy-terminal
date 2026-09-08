const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { API_VERSION, registerAiIpc } = require("./ipc.cjs");

test("preload and renderer agree with main; handshake gates versioned IPC", async () => {
  const handlers = new Map();
  let bridge;
  let listener;
  const ipcRenderer = {
    invoke: (channel, input) =>
      handlers.get(channel)({ sender: { id: 1 } }, input),
    on: (_, value) => {
      listener = value;
    },
    removeListener: (_, value) => {
      assert.equal(value, listener);
      listener = null;
    },
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../preload.cjs"), "utf8"),
    {
      require: (name) => {
        assert.equal(name, "electron");
        return {
          contextBridge: {
            exposeInMainWorld: (_, value) => {
              bridge = value;
            },
          },
          ipcRenderer,
        };
      },
      process: { platform: "win32" },
    },
  );
  registerAiIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getVault: () => "vault",
    service: {},
    registry: { state: async () => ({ online: true }) },
    provider: {},
  });
  assert.equal(bridge.apiVersion, API_VERSION);
  const renderer = fs.readFileSync(
    path.join(__dirname, "../../features/chat/desktop-client.ts"),
    "utf8",
  );
  assert.match(renderer, new RegExp(`AI_API_VERSION = ${API_VERSION}`));
  await assert.rejects(bridge.ai.models(), { code: "MODEL_RESTART_REQUIRED" });
  await bridge.ai.handshake(API_VERSION);
  assert.equal((await bridge.ai.models()).online, true);
  const unsubscribe = bridge.ai.onEvent(() => {});
  assert.equal(typeof listener, "function");
  unsubscribe();
  assert.equal(listener, null);
});
