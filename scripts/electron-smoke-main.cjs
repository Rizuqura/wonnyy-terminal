// Playwright launches this entry with an isolated vault and application-data directory.
const { app } = require("electron");
if (!process.env.WONNYY_SMOKE_DATA)
  throw new Error("Smoke test requires isolated application data.");
app.setPath("userData", process.env.WONNYY_SMOKE_DATA);
require("../electron/main.cjs");
