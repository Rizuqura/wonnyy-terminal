const { app } = require("electron");
if (!process.env.WONNYY_SMOKE_DATA)
  throw new Error("Isolated application data required");
app.setPath("userData", process.env.WONNYY_SMOKE_DATA);
const { createOnlineSmokeFetch } = require("./fixtures/online-smoke-fetch.cjs");
const mock = createOnlineSmokeFetch();
globalThis.fetch = mock.fetchImpl;
globalThis.onlineSmoke = mock.state;
require("../electron/main.cjs");
