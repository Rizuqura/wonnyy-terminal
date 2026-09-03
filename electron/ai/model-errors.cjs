const MODEL_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "MODEL_INVALID_REQUEST",
  OFFLINE: "MODEL_OFFLINE",
  NOT_INSTALLED: "MODEL_NOT_INSTALLED",
  NOT_FOUND: "MODEL_NOT_FOUND",
  TIMEOUT: "MODEL_TIMEOUT",
  INVALID_RESPONSE: "MODEL_INVALID_RESPONSE",
  PROVIDER: "PROVIDER_ERROR",
  INTERNAL: "MODEL_INTERNAL_ERROR",
});

class ModelRuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ModelRuntimeError";
    this.code = code;
    this.details = details;
  }
}

function serializeModelError(error) {
  if (error instanceof ModelRuntimeError) {
    return { code: error.code, message: error.message, details: error.details };
  }
  return {
    code: MODEL_ERROR_CODES.INTERNAL,
    message: error instanceof Error ? error.message : "An unexpected model runtime error occurred.",
    details: {},
  };
}

module.exports = { MODEL_ERROR_CODES, ModelRuntimeError, serializeModelError };
