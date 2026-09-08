const MODEL_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: "MODEL_INVALID_REQUEST",
  CONTEXT_INVALID: "MODEL_CONTEXT_INVALID",
  CONTEXT_TOO_LARGE: "MODEL_CONTEXT_TOO_LARGE",
  RUN_RECORD_INVALID: "MODEL_RUN_RECORD_INVALID",
  RUN_RECORD_EXISTS: "MODEL_RUN_RECORD_EXISTS",
  RUN_RECORD_NOT_FOUND: "MODEL_RUN_RECORD_NOT_FOUND",
  RUN_RECORD_FAILED: "MODEL_RUN_RECORD_FAILED",
  OFFLINE: "MODEL_OFFLINE",
  NOT_INSTALLED: "MODEL_NOT_INSTALLED",
  NOT_FOUND: "MODEL_NOT_FOUND",
  TIMEOUT: "MODEL_TIMEOUT",
  CANCELLED: "MODEL_CANCELLED",
  INVALID_RESPONSE: "MODEL_INVALID_RESPONSE",
  PROVIDER: "PROVIDER_ERROR",
  INTERNAL: "MODEL_INTERNAL_ERROR",
  BUSY: "MODEL_BUSY",
  RESTART_REQUIRED: "MODEL_RESTART_REQUIRED",
  STORAGE_INVALID: "MODEL_STORAGE_INVALID",
  STORAGE_FAILED: "MODEL_STORAGE_FAILED",
  INTERRUPTED: "MODEL_INTERRUPTED",
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
  if (
    error?.name === "BrainScopeError" &&
    typeof error.code === "string" &&
    error.code.startsWith("BRAIN_")
  ) {
    return {
      code: error.code,
      message: error.message,
      details:
        error.details && typeof error.details === "object" ? error.details : {},
    };
  }
  return {
    code: MODEL_ERROR_CODES.INTERNAL,
    message:
      error instanceof Error
        ? error.message
        : "An unexpected model runtime error occurred.",
    details: {},
  };
}

module.exports = { MODEL_ERROR_CODES, ModelRuntimeError, serializeModelError };
