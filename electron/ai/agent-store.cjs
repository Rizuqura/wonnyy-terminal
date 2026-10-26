const path = require("node:path");
const fs = require("node:fs/promises");
const { createHash } = require("node:crypto");
const {
  readJson,
  writeJson,
  serialQueue,
  safeDirectory,
  rejectSymlink,
} = require("./json-store.cjs");
const { z, parse } = require("./schemas.cjs");
const { ModelRuntimeError } = require("./model-errors.cjs");
const { SYSTEM_PROMPT } = require("./prompt-builder.cjs");
const {
  AGENT_ID,
  AGENT_DEFINITIONS,
  POLICY_VERSION,
  validateCustomInstructions,
} = require("./agent-policy.cjs");
const idSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const rowSchema = z
  .object({
    id: idSchema,
    displayName: z.string().min(1).max(120),
    avatar: z.union([
      z
        .object({ type: z.literal("letter"), letter: z.enum(["W", "C"]) })
        .strict(),
      z
        .object({
          type: z.literal("local-asset"),
          assetId: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ]),
    customInstructions: z.string().max(8000),
    mode: z.literal("strict-context-analysis"),
    policyVersion: z.string(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
const schema = z
  .object({
    schemaVersion: z.literal(1),
    agents: z.record(idSchema, rowSchema),
  })
  .strict();
const seed = (id = AGENT_ID) => {
  const definition = AGENT_DEFINITIONS[id];
  if (!definition) return null;
  const timestamp = new Date().toISOString();
  return {
    id,
    displayName: definition.displayName,
    avatar: { type: "letter", letter: definition.letter },
    customInstructions: "",
    mode: "strict-context-analysis",
    policyVersion: POLICY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
class AgentStore {
  constructor(directory, decodeImage) {
    this.file = path.join(directory, "agents.json");
    this.assets = path.join(directory, "agent-assets");
    this.decodeImage = decodeImage;
    this.queue = serialQueue();
  }
  read() {
    return readJson(
      this.file,
      (value) =>
        parse(
          schema,
          value,
          "MODEL_STORAGE_INVALID",
          "Agent settings are invalid; they have not been overwritten.",
        ),
      { schemaVersion: 1, agents: { [AGENT_ID]: seed() } },
    );
  }
  async get(id = AGENT_ID) {
    parse(idSchema, id);
    const state = await this.read();
    const row = state.agents[id] ?? seed(id);
    if (!row || row.id !== id)
      throw new ModelRuntimeError("MODEL_INVALID_REQUEST", "Unknown agent.");
    const value = {
      ...row,
      policyVersion: POLICY_VERSION,
      protectedInstructions: SYSTEM_PROMPT.replaceAll(
        "Wonnyy Agent",
        row.displayName,
      ),
      skills: [],
      avatarUrl: null,
    };
    if (row.avatar.type === "local-asset") {
      try {
        const file = path.join(this.assets, row.avatar.assetId + ".png");
        await rejectSymlink(file);
        const bytes = await fs.readFile(file);
        if (
          bytes.length > 512 * 1024 ||
          createHash("sha256").update(bytes).digest("hex") !==
            row.avatar.assetId
        )
          throw new Error("Invalid avatar");
        value.avatarUrl = "data:image/png;base64," + bytes.toString("base64");
      } catch {
        value.avatar = {
          type: "letter",
          letter: AGENT_DEFINITIONS[id]?.letter ?? "W",
        };
      }
    }
    return value;
  }
  async prepareAvatar(bytes, extension) {
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp =
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP";
    if (
      !bytes.length ||
      bytes.length > 5 * 1024 * 1024 ||
      !(
        (extension === ".png" && png) ||
        ([".jpg", ".jpeg"].includes(extension) && jpeg) ||
        (extension === ".webp" && webp)
      )
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "Choose a valid PNG, JPG or WebP image up to 5 MB.",
      );
    const image = this.decodeImage?.(bytes);
    const size = image?.getSize();
    if (
      !size ||
      image.isEmpty() ||
      !size.width ||
      !size.height ||
      size.width > 8192 ||
      size.height > 8192 ||
      size.width * size.height > 16000000
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "The image cannot be decoded or exceeds 8192 pixels per side.",
      );
    const side = Math.min(size.width, size.height);
    const processed = image
      .crop({
        x: Math.floor((size.width - side) / 2),
        y: Math.floor((size.height - side) / 2),
        width: side,
        height: side,
      })
      .resize({ width: 128, height: 128 })
      .toPNG();
    if (!processed.length || processed.length > 512 * 1024)
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "Could not process this profile picture.",
      );
    return "data:image/png;base64," + processed.toString("base64");
  }
  save(input) {
    return this.queue(async () => {
      const patch = parse(
        z
          .object({
            id: idSchema,
            customInstructions: z.string().max(8000),
            avatarDataUrl: z.string().max(700000).nullable().optional(),
          })
          .strict(),
        input,
      );
      const customInstructions = validateCustomInstructions(
        patch.customInstructions,
      );
      const state = await this.read();
      const row = state.agents[patch.id] ?? seed(patch.id);
      if (!row || row.id !== patch.id)
        throw new ModelRuntimeError("MODEL_INVALID_REQUEST", "Unknown agent.");
      let avatar = row.avatar;
      if (patch.avatarDataUrl === null)
        avatar = {
          type: "letter",
          letter: AGENT_DEFINITIONS[patch.id]?.letter ?? "W",
        };
      else if (patch.avatarDataUrl !== undefined) {
        if (
          !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
            patch.avatarDataUrl,
          )
        )
          throw new ModelRuntimeError(
            "MODEL_INVALID_REQUEST",
            "Invalid profile picture.",
          );
        const bytes = Buffer.from(patch.avatarDataUrl.split(",")[1], "base64");
        const url = await this.prepareAvatar(bytes, ".png");
        const processed = Buffer.from(url.split(",")[1], "base64");
        const assetId = createHash("sha256").update(processed).digest("hex");
        await safeDirectory(this.assets);
        const file = path.join(this.assets, assetId + ".png");
        await rejectSymlink(file);
        await fs.writeFile(file, processed);
        avatar = { type: "local-asset", assetId };
      }
      state.agents[patch.id] = {
        ...row,
        avatar,
        customInstructions,
        policyVersion: POLICY_VERSION,
        updatedAt: new Date().toISOString(),
      };
      await writeJson(this.file, state);
      return this.get(patch.id);
    });
  }
}
module.exports = { AgentStore, AGENT_ID };
