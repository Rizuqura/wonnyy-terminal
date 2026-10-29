// Application ceilings, not claims about any particular model's capacity.
const LOCAL_CONTEXT_LIMIT = 32768;
const REMOTE_CONTEXT_LIMIT = 2097152;

function contextLimit(providerId, advertisedLength) {
  const ceiling =
    providerId === "ollama" ? LOCAL_CONTEXT_LIMIT : REMOTE_CONTEXT_LIMIT;
  return Math.min(
    ceiling,
    Number.isSafeInteger(advertisedLength) && advertisedLength > 0
      ? advertisedLength
      : LOCAL_CONTEXT_LIMIT,
  );
}

module.exports = { LOCAL_CONTEXT_LIMIT, REMOTE_CONTEXT_LIMIT, contextLimit };
