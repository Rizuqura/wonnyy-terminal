const BRAIN_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "BRAIN_INVALID_REQUEST",
  INVALID_STATIONS: "BRAIN_INVALID_STATIONS",
  VAULT_UNAVAILABLE: "BRAIN_VAULT_UNAVAILABLE",
  SCOPE_NOT_FOUND: "BRAIN_SCOPE_NOT_FOUND",
  SCOPE_EXPIRED: "BRAIN_SCOPE_EXPIRED",
  OWNER_MISMATCH: "BRAIN_SCOPE_OWNER_MISMATCH",
  SOURCE_NOT_AUTHORIZED: "BRAIN_SOURCE_NOT_AUTHORIZED",
  SOURCE_UNAVAILABLE: "BRAIN_SOURCE_UNAVAILABLE",
  SOURCE_CHANGED: "BRAIN_SOURCE_CHANGED",
  INTERNAL: "BRAIN_INTERNAL_ERROR",
});

class BrainScopeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "BrainScopeError";
    this.code = code;
    this.details = details;
  }
}

function serializeBrainError(error) {
  if (error instanceof BrainScopeError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: BRAIN_ERROR_CODES.INTERNAL,
    message: error instanceof Error ? error.message : "An unexpected Brain Scope error occurred.",
    details: {},
  };
}

module.exports = { BRAIN_ERROR_CODES, BrainScopeError, serializeBrainError };
