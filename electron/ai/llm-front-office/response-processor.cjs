/** Purpose: validate text/JSON output without repair calls. Inputs: response/schema; outputs: validation result.
 * Dependencies: none beyond errors. Failure: explicit unsupported schema or invalid output. Knobs: format/schema. Owner: backend. */
const { ModelRuntimeError } = require("../model-errors.cjs");
const KEYS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "description",
]);
const TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
];

/** Accept an explicit, documented JSON Schema subset; reject unsupported keywords before dispatch. */
function validateSchemaDefinition(schema, depth = 0) {
  if (schema === null && depth === 0) return;
  const invalid = () => {
    throw new ModelRuntimeError(
      "MODEL_INVALID_REQUEST",
      "Use the supported JSON schema subset: type, properties, required, additionalProperties, items and enum (maximum depth 10).",
    );
  };
  if (
    !schema ||
    typeof schema !== "object" ||
    Array.isArray(schema) ||
    depth > 10 ||
    Object.keys(schema).some((k) => !KEYS.has(k)) ||
    !TYPES.includes(schema.type)
  )
    invalid();
  if (
    schema.description !== undefined &&
    typeof schema.description !== "string"
  )
    invalid();
  if (
    schema.enum !== undefined &&
    (!Array.isArray(schema.enum) || schema.enum.length > 100)
  )
    invalid();
  if (schema.type === "object") {
    if (
      schema.properties !== undefined &&
      (!schema.properties ||
        typeof schema.properties !== "object" ||
        Array.isArray(schema.properties))
    )
      invalid();
    if (
      schema.required !== undefined &&
      (!Array.isArray(schema.required) ||
        schema.required.some(
          (k) =>
            typeof k !== "string" || !Object.hasOwn(schema.properties ?? {}, k),
        ))
    )
      invalid();
    if (
      schema.additionalProperties !== undefined &&
      typeof schema.additionalProperties !== "boolean"
    )
      invalid();
    for (const child of Object.values(schema.properties ?? {}))
      validateSchemaDefinition(child, depth + 1);
  } else if (
    ["properties", "required", "additionalProperties"].some(
      (k) => schema[k] !== undefined,
    )
  )
    invalid();
  if (schema.type === "array") {
    if (!schema.items) invalid();
    validateSchemaDefinition(schema.items, depth + 1);
  } else if (schema.items !== undefined) invalid();
}
const matches = (value, s) => {
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  if (s.type === "integer" ? !Number.isSafeInteger(value) : type !== s.type)
    return false;
  if (
    s.enum &&
    !s.enum.some((v) => JSON.stringify(v) === JSON.stringify(value))
  )
    return false;
  if (type === "object")
    return (
      (s.required ?? []).every((k) => Object.hasOwn(value, k)) &&
      Object.entries(value).every(([k, v]) =>
        Object.hasOwn(s.properties ?? {}, k)
          ? matches(v, s.properties[k])
          : s.additionalProperties !== false,
      )
    );
  return type !== "array" || value.every((v) => matches(v, s.items));
};
/** Return checked output; preserve length/refusal information instead of claiming a complete answer. */
function processResponse(response, generation) {
  if (
    !response ||
    typeof response.content !== "string" ||
    !response.content.trim()
  )
    throw new ModelRuntimeError(
      "MODEL_INVALID_RESPONSE",
      "The provider returned no visible text.",
    );
  if (response.finishReason !== "stop")
    throw new ModelRuntimeError(
      "MODEL_INVALID_RESPONSE",
      response.finishReason === "length"
        ? "The output cap was reached. Increase it or request a shorter answer."
        : "The provider stopped without a complete answer (refusal or unsupported finish reason).",
      {
        reason: response.finishReason === "length" ? "truncated" : "incomplete",
      },
    );
  if (generation.format === "text") return { valid: true, format: "text" };
  let value;
  try {
    value = JSON.parse(response.content);
  } catch {
    return { valid: false, format: "json", reason: "invalid_json" };
  }
  return {
    valid: !generation.jsonSchema || matches(value, generation.jsonSchema),
    format: "json",
    reason:
      generation.jsonSchema && !matches(value, generation.jsonSchema)
        ? "schema_mismatch"
        : null,
  };
}
module.exports = { validateSchemaDefinition, processResponse };
