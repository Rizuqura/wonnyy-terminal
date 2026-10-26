const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  readJson,
  writeJson,
  serialQueue,
  safeDirectory,
} = require("./json-store.cjs");
const { validateContextIdentity } = require("./context-identity.cjs");
const { ModelRuntimeError } = require("./model-errors.cjs");

function validate(value) {
  if (![1, 2].includes(value?.schemaVersion) || !Array.isArray(value.boxes))
    throw new Error("Invalid Context Box storage.");
  const ids = new Set(),
    names = new Set();
  for (const box of value.boxes) {
    if (
      typeof box.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(box.id) ||
      typeof box.name !== "string" ||
      !box.name.trim() ||
      box.name.length > 120 ||
      box.name !== box.name.trim() ||
      !Number.isInteger(box.revision) ||
      box.revision < 1 ||
      !Number.isFinite(Date.parse(box.createdAt)) ||
      !Number.isFinite(Date.parse(box.updatedAt)) ||
      ids.has(box.id) ||
      names.has(box.name.toLowerCase())
    )
      throw new Error("Invalid Context Box.");
    if (box.contextIdentity) validateContextIdentity(box.contextIdentity);
    if (value.schemaVersion === 1) {
      box.items = box.contextIdentity.sources.map((source) => ({
        id: source.sourceId,
        relativePath: source.relativePath,
        addedAt: box.createdAt,
      }));
    }
    if (
      !Array.isArray(box.items) ||
      box.items.some(
        (item) =>
          typeof item.id !== "string" ||
          !item.id ||
          typeof item.relativePath !== "string" ||
          !item.relativePath ||
          path.isAbsolute(item.relativePath) ||
          item.relativePath
            .split(/[\\/]/)
            .some((part) => part === ".." || part === ".wonnyy") ||
          !/\.(md|markdown|csv|pdf)$/i.test(item.relativePath) ||
          !Number.isFinite(Date.parse(item.addedAt)),
      ) ||
      new Set(box.items.map((item) => item.id)).size !== box.items.length ||
      new Set(box.items.map((item) => item.relativePath)).size !==
        box.items.length
    )
      throw new Error("Invalid Context Box membership.");
    ids.add(box.id);
    names.add(box.name.toLowerCase());
  }
  return value;
}
class ContextBoxStore {
  constructor(root) {
    this.directory = path.join(root, ".wonnyy");
    this.file = path.join(this.directory, "context-boxes.json");
    this.queue = serialQueue();
  }
  async list() {
    await safeDirectory(this.directory);
    return (
      await readJson(this.file, validate, { schemaVersion: 1, boxes: [] })
    ).boxes;
  }
  async get(id) {
    const box = (await this.list()).find((box) => box.id === id);
    if (!box)
      throw new ModelRuntimeError(
        "MODEL_CONTEXT_INVALID",
        "Context Box is unavailable in this vault.",
      );
    return box;
  }
  name(value, boxes, id) {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 120)
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "Use a Context Box name between 1 and 120 characters.",
      );
    const name = value.trim();
    if (
      boxes.some(
        (box) => box.id !== id && box.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new ModelRuntimeError(
        "MODEL_INVALID_REQUEST",
        "A Context Box with this name already exists.",
      );
    return name;
  }
  create(name, contextIdentity = null, paths = []) {
    return this.queue(async () => {
      if (contextIdentity) validateContextIdentity(contextIdentity);
      const boxes = await this.list(),
        now = new Date().toISOString();
      const box = {
        id: randomUUID(),
        name: this.name(name, boxes),
        revision: 1,
        createdAt: now,
        updatedAt: now,
        contextIdentity,
        items: (contextIdentity
          ? contextIdentity.sources.map((s) => s.relativePath)
          : paths
        ).map((relativePath) => ({
          id: randomUUID(),
          relativePath,
          addedAt: now,
        })),
      };
      await writeJson(
        this.file,
        validate({ schemaVersion: 2, boxes: [...boxes, box] }),
      );
      return box;
    });
  }
  rename(id, name) {
    return this.queue(async () => {
      const boxes = await this.list(),
        box = boxes.find((box) => box.id === id);
      if (!box)
        throw new ModelRuntimeError(
          "MODEL_CONTEXT_INVALID",
          "Context Box is unavailable.",
        );
      box.name = this.name(name, boxes, id);
      box.updatedAt = new Date().toISOString();
      await writeJson(this.file, validate({ schemaVersion: 2, boxes }));
      return box;
    });
  }
  edit(id, operation) {
    return this.queue(async () => {
      const boxes = await this.list();
      const box = boxes.find((box) => box.id === id);
      if (!box)
        throw new ModelRuntimeError(
          "MODEL_CONTEXT_INVALID",
          "Context Box is unavailable.",
        );
      await operation(box, boxes);
      box.revision++;
      box.updatedAt = new Date().toISOString();
      await writeJson(this.file, validate({ schemaVersion: 2, boxes }));
      return box;
    });
  }
  add(id, paths) {
    return this.edit(id, (box) => {
      for (const relativePath of paths)
        if (!box.items.some((item) => item.relativePath === relativePath))
          box.items.push({
            id: randomUUID(),
            relativePath,
            addedAt: new Date().toISOString(),
          });
    });
  }
  removeItem(id, itemId) {
    return this.edit(id, (box) => {
      box.items = box.items.filter((item) => item.id !== itemId);
    });
  }
  relink(id, itemId, relativePath) {
    return this.edit(id, (box) => {
      const item = box.items.find((item) => item.id === itemId);
      if (
        !item ||
        box.items.some(
          (other) => other.id !== itemId && other.relativePath === relativePath,
        )
      )
        throw new ModelRuntimeError(
          "MODEL_INVALID_REQUEST",
          "Choose an existing membership and a path not already in this box.",
        );
      item.relativePath = relativePath;
    });
  }
  remove(id) {
    return this.edit(id, (_, boxes) => {
      boxes.splice(
        boxes.findIndex((box) => box.id === id),
        1,
      );
    });
  }
}
module.exports = { ContextBoxStore };
