/** Purpose: cached capability metadata, editable overrides and benchmark evidence.
 * Inputs: provider catalogs/local validated records; outputs: provenance-aware profiles.
 * Dependencies: existing JSON store/credentials. Failures: safe validation/storage errors.
 * Knobs: overrides and evidence age; no scheduled requests. Owner: backend. */
const path = require("node:path");
const { readJson, writeJson, serialQueue } = require("../json-store.cjs");
const {
  z,
  parse,
  profileSchema,
  evidenceSchema,
  deploymentId,
} = require("./experiment-contracts.cjs");
const { ModelRuntimeError } = require("../model-errors.cjs");
const patchSchema = profileSchema
  .pick({
    logicalModelId: true,
    contextTokens: true,
    maxOutputTokens: true,
    inputUsdPerMillion: true,
    outputUsdPerMillion: true,
    tools: true,
    vision: true,
    structuredOutput: true,
    inputModalities: true,
    outputModalities: true,
    supportedParameters: true,
  })
  .partial()
  .strict();
const stateSchema = z
  .object({
    schemaVersion: z.literal(1),
    profiles: z.array(profileSchema).max(20000),
    overrides: z
      .array(
        z
          .object({
            deploymentId,
            patch: patchSchema,
            checkedAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(20000),
    evidence: z.array(evidenceSchema).max(20000),
    favorites: z.array(deploymentId).max(1000),
  })
  .strict();
const EMPTY = {
  schemaVersion: 1,
  profiles: [],
  overrides: [],
  evidence: [],
  favorites: [],
};
const urls = {
  openrouter: "https://openrouter.ai/api/v1/models",
  nvidia: "https://integrate.api.nvidia.com/v1/models",
};

/** Store metadata only; credentials are queried for configured status, never copied. */
class CapabilityRegistry {
  constructor(directory, registry, credentials) {
    this.file = path.join(directory, "front-office-catalog.json");
    this.registry = registry;
    this.credentials = credentials;
    this.queue = serialQueue();
  }
  /** Validate local metadata without echoing corrupt contents. */
  async read() {
    try {
      return await readJson(this.file, (v) => parse(stateSchema, v), EMPTY);
    } catch {
      throw new ModelRuntimeError(
        "MODEL_STORAGE_INVALID",
        "Repair front-office-catalog.json; invalid metadata was not overwritten.",
      );
    }
  }
  /** Refresh one explicitly selected provider; catalog availability is not inference/quota verification. */
  refresh(providerId, signal) {
    return this.queue(async () => {
      const rows = await this.registry
        .providerFor(providerId)
        .listModels({ signal });
      const checkedAt = new Date().toISOString();
      const profiles = rows.map((row) => {
        const meta = row.frontOfficeMetadata ?? {};
        return parse(profileSchema, {
          deploymentId: `${providerId}:${row.name}`,
          modelId: row.name,
          logicalModelId: row.name,
          providerId,
          label: row.displayName ?? row.name,
          inputModalities: meta.inputModalities ?? ["text"],
          outputModalities: meta.outputModalities ?? ["text"],
          tools: meta.tools ?? "unknown",
          vision: meta.vision ?? "unknown",
          structuredOutput: meta.structuredOutput ?? "unknown",
          supportedParameters: meta.supportedParameters ?? null,
          contextTokens: row.contextLength ?? null,
          maxOutputTokens: row.outputLimit ?? null,
          inputUsdPerMillion: meta.inputUsdPerMillion ?? null,
          outputUsdPerMillion: meta.outputUsdPerMillion ?? null,
          source: {
            url: urls[providerId],
            checkedAt,
            kind: "provider-catalog",
          },
        });
      });
      const state = await this.read();
      state.profiles = [
        ...state.profiles.filter((p) => p.providerId !== providerId),
        ...profiles,
      ];
      await writeJson(this.file, state);
      return profiles.length;
    });
  }
  /** Apply validated metadata overrides with local provenance; never overwrite the source catalog. */
  override(input) {
    const value = parse(
      z.object({ deploymentId, patch: patchSchema.nullable() }).strict(),
      input,
    );
    return this.queue(async () => {
      const state = await this.read();
      if (!state.profiles.some((p) => p.deploymentId === value.deploymentId))
        throw new ModelRuntimeError(
          "MODEL_NOT_FOUND",
          "Refresh this model's catalog before overriding it.",
        );
      state.overrides = state.overrides.filter(
        (o) => o.deploymentId !== value.deploymentId,
      );
      if (value.patch)
        state.overrides.push({ ...value, checkedAt: new Date().toISOString() });
      await writeJson(this.file, state);
    });
  }
  /** Import inspectable empirical outcomes; score provenance remains user supplied, never invented. */
  addEvidence(input) {
    const evidence = parse(evidenceSchema, input);
    return this.queue(async () => {
      const state = await this.read();
      if (
        !state.profiles.some(
          (p) =>
            p.deploymentId === evidence.deploymentId &&
            p.modelId === evidence.modelVersion,
        )
      )
        throw new ModelRuntimeError(
          "MODEL_INVALID_REQUEST",
          "Evidence must identify a catalog model and its exact version.",
        );
      state.evidence.push(evidence);
      await writeJson(this.file, parse(stateSchema, state));
    });
  }
  /** Persist a bounded set of non-secret favorites. */
  favorite(input) {
    const v = parse(
      z.object({ deploymentId, favorite: z.boolean() }).strict(),
      input,
    );
    return this.queue(async () => {
      const s = await this.read();
      s.favorites = s.favorites.filter((id) => id !== v.deploymentId);
      if (v.favorite) s.favorites.push(v.deploymentId);
      await writeJson(this.file, parse(stateSchema, s));
    });
  }
  /** Return effective profiles, independent original source and current credential status. */
  async state() {
    const state = await this.read();
    const statuses = Object.fromEntries(
      await Promise.all(
        ["openrouter", "nvidia"].map(async (id) => [
          id,
          (await this.credentials.status(id)).configured,
        ]),
      ),
    );
    return {
      ...state,
      profiles: state.profiles.map((p) => {
        const o = state.overrides.find(
          (o) => o.deploymentId === p.deploymentId,
        );
        return {
          ...p,
          ...(o?.patch ?? {}),
          source: o
            ? { ...p.source, checkedAt: o.checkedAt, kind: "local-override" }
            : p.source,
          catalogSource: p.source,
          pricingSource:
            o &&
            (Object.hasOwn(o.patch, "inputUsdPerMillion") ||
              Object.hasOwn(o.patch, "outputUsdPerMillion"))
              ? { ...p.source, checkedAt: o.checkedAt, kind: "local-override" }
              : p.source,
          credentialConfigured: Boolean(statuses[p.providerId]),
          favorite: state.favorites.includes(p.deploymentId),
          availability: "catalog-listed",
        };
      }),
    };
  }
}
module.exports = { CapabilityRegistry };
