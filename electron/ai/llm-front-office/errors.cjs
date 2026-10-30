/** Purpose: errors safe for experiment UI/logs. Input: arbitrary error; output: fixed public code/message.
 * Dependencies: allowlisted error schema. Failure: unknown error becomes internal. Knobs: none. Owner: backend. */
const { errorCode } = require("./contracts.cjs");
const messages = {
  MODEL_CANCELLED: "The experiment was stopped.",
  MODEL_TIMEOUT: "The total experiment deadline was reached.",
  REMOTE_TIMEOUT:
    "The provider timed out. Retry explicitly or adjust the deadline.",
  AUTH_REQUIRED:
    "Configure the selected provider or local gateway credential in Settings.",
  AUTH_INVALID:
    "The provider rejected authentication. Check the key and account access.",
  AUTH_STORAGE_UNAVAILABLE: "OS-backed credential storage is unavailable.",
  PAYMENT_REQUIRED:
    "The provider requires credits. Check account quota and billing.",
  RATE_LIMITED: "Provider quota/rate limit reached. Wait before retrying.",
  MODEL_UNAVAILABLE:
    "No eligible deployment is available. Review the pin, credentials, capability metadata, permitted providers, circuit state and budget.",
  MODEL_CONTEXT_TOO_LARGE:
    "The full history, output reserve or cumulative token/cost budget does not fit. Nothing was truncated. Start a new experiment or adjust limits.",
  MODEL_INVALID_REQUEST:
    "Invalid experiment request/configuration or unsupported option. Review the configuration and input limits.",
  MODEL_INVALID_RESPONSE:
    "The response was empty, incomplete, refused or reached the output cap. Inspect finish/validation metrics and retry explicitly.",
  MODEL_STORAGE_INVALID:
    "Local experiment metadata is invalid. Repair the relevant metadata file; it was not overwritten.",
  MODEL_STORAGE_FAILED:
    "Could not save the local experiment. Check vault access and disk space.",
  REMOTE_SERVER_ERROR:
    "The provider reported a server error; bounded attempts were exhausted or partial output prevented retry.",
  PROVIDER_OFFLINE: "Cannot connect to the provider or local gateway.",
};
/** Never copy an arbitrary error message/body/header into a trace, export or renderer. */
function publicError(error) {
  const code = errorCode.safeParse(error?.code).success
    ? error.code
    : "MODEL_INTERNAL_ERROR";
  return {
    code,
    message:
      messages[code] ??
      "The experiment failed. Check local setup and retry explicitly.",
    details: {},
  };
}
module.exports = { publicError };
