import type { BrainScope, BrainScopeMode, BrainErrorCode } from "./electron";

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
export type ModelRequest = {
  id: string;
  model: string;
  messages: ModelMessage[];
  scope?: BrainScope;
  format?: Record<string, unknown>;
  contextWindow?: number;
  settings?: ModelSettings;
  signal?: AbortSignal;
  onContent?: (content: string) => void;
};
export type ModelErrorCode =
  | "CONTEXT_INSUFFICIENT"
  | "MODEL_PULL_FAILED"
  | "AUTH_REQUIRED"
  | "AUTH_INVALID"
  | "AUTH_STORAGE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "PROVIDER_OFFLINE"
  | "REMOTE_TIMEOUT"
  | "REMOTE_SERVER_ERROR"
  | "REMOTE_REQUEST_INVALID"
  | "REMOTE_CONTENT_BLOCKED"
  | "MODEL_UNAVAILABLE"
  | "MODEL_INVALID_REQUEST"
  | "MODEL_CONTEXT_INVALID"
  | "MODEL_CONTEXT_TOO_LARGE"
  | "MODEL_RUN_RECORD_INVALID"
  | "MODEL_RUN_RECORD_EXISTS"
  | "MODEL_RUN_RECORD_NOT_FOUND"
  | "MODEL_RUN_RECORD_FAILED"
  | "MODEL_OFFLINE"
  | "MODEL_NOT_INSTALLED"
  | "MODEL_NOT_FOUND"
  | "MODEL_TIMEOUT"
  | "MODEL_CANCELLED"
  | "MODEL_INVALID_RESPONSE"
  | "PROVIDER_ERROR"
  | "MODEL_INTERNAL_ERROR"
  | "MODEL_BUSY"
  | "MODEL_RESTART_REQUIRED"
  | "MODEL_STORAGE_INVALID"
  | "MODEL_STORAGE_FAILED"
  | "MODEL_INTERRUPTED";
export type ModelRuntimeErrorValue = {
  code: ModelErrorCode | BrainErrorCode;
  message: string;
  details: Record<string, unknown>;
};
export type LocalModel = {
  name: string;
  model: string;
  size: number;
  digest: string;
  modifiedAt: string | null;
  family: string | null;
  parameterSize: string | null;
  quantization: string | null;
  contextLength: number | null;
  outputLimit?: number | null;
  capabilities: string[];
};
export type ModelStatus = {
  provider: "ollama";
  endpoint: string;
  online: boolean;
  checkedAt: string;
  models: LocalModel[];
  error: ModelRuntimeErrorValue | null;
};
export type ModelSourceReference = {
  sourceId: string;
  relativePath: string;
  contentHash: string;
};
export type ModelAvailableSourceReference = {
  sourceId: string;
  relativePath: string;
  contentHash: string | null;
};
export type ModelResponse = {
  id: string;
  provider: string;
  model: string;
  content: string;
  sources: ModelSourceReference[];
  finishReason: string;
  createdAt: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalDurationNs: number | null;
  };
};
export type ContextModelResult = ModelResponse & {
  scopeId: string;
  scopeMode: "active-context";
  scopeManifestVersion: string;
  promptVersion: string;
};
export type ModelRunStatus = "succeeded" | "failed";
export type ModelRunErrorValue = {
  code: ModelErrorCode | BrainErrorCode;
  message: string;
  details: Record<string, unknown>;
};
export type ModelRunRecord = {
  schemaVersion: 1;
  runId: string;
  status: ModelRunStatus;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  scope: { id: string; mode: BrainScopeMode; manifestVersion: string } | null;
  provider: string;
  model: string;
  promptVersion: string | null;
  userMessage: string;
  sourcesAvailable: ModelAvailableSourceReference[];
  sourcesActuallyRead: ModelSourceReference[];
  response: string | null;
  finishReason: string | null;
  usage: ModelResponse["usage"] | null;
  error: ModelRunErrorValue | null;
};
export type ModelConnectivityTest = ModelResponse & {
  passed: boolean;
  expected: "WONNYY ONLINE";
};
export interface ModelProvider {
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export type ContextIdentity = {
  id: string;
  mode: "active-context";
  sources: ModelSourceReference[];
};
export type ChatMessage = {
  contextIdentity?: ContextIdentity;
  contextBox?: { id: string; name: string; revision: number };
  provider?: string;
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  runId?: string;
  userMessageId?: string;
  sources?: ModelSourceReference[];
  model?: string;
};
export type ChatAttempt = {
  requestId: string;
  runId: string;
  userMessageId: string;
  status: "pending" | "succeeded" | "failed" | "cancelled" | "interrupted";
  error: ModelRuntimeErrorValue | null;
};
export type ContextBox = {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  contextIdentity: ContextIdentity | null;
  items: ContextBoxItem[];
};
export type ContextBoxItem = {
  id: string;
  relativePath: string;
  addedAt: string;
  status?: "ready" | "unavailable";
  message?: string;
  contentHash?: string;
  estimatedTokens?: number;
  type?: string;
};
export type ContextBoxEdit = {
  action: "create" | "add" | "remove" | "relink" | "delete";
  id?: string;
  name?: string;
  paths?: string[];
  itemId?: string;
  relativePath?: string;
};
export type Conversation = {
  agentId?: string;
  schemaVersion: 1 | 2 | 3;
  contextBoxId?: string;
  contextBoxRevision?: number;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  contextIdentity: ContextIdentity;
  messages: ChatMessage[];
  attempts: ChatAttempt[];
};
export type AgentConfig = {
  id: string;
  displayName: string;
  avatar:
    | { type: "letter"; letter: "W" | "C" }
    | { type: "local-asset"; assetId: string };
  avatarUrl: string | null;
  customInstructions: string;
  skills: string[];
  protectedInstructions: string;
  policyVersion: string;
  mode: "strict-context-analysis";
  createdAt: string;
  updatedAt: string;
};
export type RuntimeStatus = {
  message?: string;
  startedAt?: number;
  progress?: { current: number; total?: number; unit: string };
  context?: { sourceCount: number; estimatedTokens?: number };
};
export type ModelPullStatus = RuntimeStatus & {
  model: string;
  phase: "model-pulling" | "model-installed" | "cancelled" | "error";
  error?: string;
};
export type ChatState =
  | "CONTEXT_TOO_LARGE"
  | "CONTEXT_READING"
  | "CONTEXT_READY"
  | "CONTEXT_INSUFFICIENT"
  | "LIMITED_CONTEXT"
  | "MODEL_CHECKING"
  | "MODEL_READY"
  | "CANCELLED"
  | "REMOTE_CONNECTING"
  | "IDLE"
  | "CONTEXT_NEEDED"
  | "MODEL_OFFLINE"
  | "MODEL_MISSING"
  | "MODEL_LOADING"
  | "READY"
  | "PREPARING_CONTEXT"
  | "GENERATING"
  | "VALIDATING"
  | "RECORDING"
  | "CANCELLING"
  | "ERROR"
  | "RESTART_REQUIRED";
export type ModelSettings = {
  schemaVersion: 1;
  providerId: "ollama" | "gemini" | "nvidia" | "openrouter";
  modelId: string | null;
  contextWindow: number;
  outputLimit: number;
  temperature: number;
  streaming: boolean;
  keepAliveSeconds: number;
  loadTimeoutMs: number;
  inactivityTimeoutMs: number;
  absoluteTimeoutMs: number;
};
export type ModelDescriptor = {
  providerId: ModelSettings["providerId"];
  modelId: string;
  displayName: string;
  location: "local" | "remote";
  installed: boolean;
  available: boolean;
  active: boolean;
  profile: string;
  recommended: boolean;
  capabilities: string[];
  contextLength: number | null;
  outputLimit?: number | null;
  warnings: string[];
  pricingClass: "unknown";
};
export type ProviderStatus = {
  id: ModelSettings["providerId"];
  displayName: string;
  location: "local" | "remote";
  online: boolean;
  error: ModelRuntimeErrorValue | null;
  configured: boolean;
  secureStorageAvailable?: boolean;
};
export type RegistryState = {
  providers: ProviderStatus[];
  online: boolean;
  error: ModelRuntimeErrorValue | null;
  settings: ModelSettings;
  models: ModelDescriptor[];
};
export type ScopeSelection = {
  activeStationIds: string[];
  matchMode: "any" | "all";
};
export type ChatRequest = ScopeSelection & {
  conversationId: string;
  requestId: string;
  userMessage: string;
  expectedContextId: string;
  retryOf?: string;
};
export type ChatRun = Omit<ModelRunRecord, "schemaVersion" | "status"> & {
  schemaVersion: 2;
  status: "succeeded" | "failed" | "cancelled";
  conversationId: string;
  requestId: string;
  contextIdentity: ContextIdentity;
  settings: ModelSettings;
  diagnostics: Record<string, unknown>;
};
export type ChatResult = { conversation: Conversation; run: ChatRun | null };
export type ChatEvent = {
  requestId: string;
  conversationId: string;
  runId: string;
  state: ChatState;
  status?: RuntimeStatus;
  content?: string;
  conversation?: Conversation;
  error?: ModelRuntimeErrorValue;
  diagnostics?: Record<string, unknown>;
};
export interface OpenRouterUsageSnapshot {
  status:
    | "unconfigured"
    | "loading"
    | "ready"
    | "stale"
    | "offline"
    | "unauthorized"
    | "rate_limited"
    | "unsupported"
    | "error";
  provider: "openrouter";
  safeKeyAlias: string | null;
  limitUsd: number | null;
  remainingUsd: number | null;
  usedUsdThisPeriod: number | null;
  resetCadence: "daily" | "weekly" | "monthly" | "none" | "unknown";
  accountCreditsRemainingUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  tokenMeasurementScope: string | null;
  dataSource: "current_key" | "management_key" | "local_meter" | "none";
  fetchedAt: string | null;
  errorMessage?: string;
}
export interface AiBridge {
  openRouterUsage(input?: {
    refresh?: boolean;
  }): Promise<OpenRouterUsageSnapshot>;
  onUsageChanged(callback: () => void): () => void;
  getAgent(id?: string): Promise<AgentConfig>;
  saveAgent(input: {
    id: string;
    customInstructions: string;
    avatarDataUrl?: string | null;
  }): Promise<AgentConfig>;
  chooseAgentAvatar(): Promise<string | null>;
  previewBoxSelection(
    paths: string[],
  ): Promise<{ files: string[]; skipped: string[] }>;
  inspectContextBox(id: string): Promise<ContextBox>;
  editContextBox(input: ContextBoxEdit): Promise<ContextBox>;
  switchContextBox(input: {
    conversationId: string;
    contextBoxId: string;
  }): Promise<Conversation>;
  listContextBoxes(): Promise<ContextBox[]>;
  saveContextBox(input: { name: string }): Promise<ContextBox>;
  renameContextBox(input: { id: string; name: string }): Promise<ContextBox>;
  checkConversation(id: string): Promise<ContextIdentity>;
  pullModel(model: string): Promise<ModelPullStatus>;
  pullStatus(): Promise<ModelPullStatus[]>;
  cancelPull(model: string): Promise<void>;
  onPull(callback: (status: ModelPullStatus) => void): () => void;
  checkRemoteModel(input: {
    providerId: "gemini" | "nvidia" | "openrouter";
    model: string;
  }): Promise<ModelCheckResult>;
  stopModelChecks(): Promise<void>;
  checkNvidiaModel(model: string): Promise<{
    model: string;
    passed: boolean;
    latencyMs: number;
    checkedAt: string;
    message: string;
    code?: string;
  }>;
  handshake(version: number): Promise<{ apiVersion: number }>;
  getStatus(): Promise<ModelStatus>;
  listModels(): Promise<LocalModel[]>;
  testModel(model: string): Promise<ModelConnectivityTest>;
  models(): Promise<RegistryState>;
  settings(input: Partial<ModelSettings>): Promise<ModelSettings>;
  saveCredential(input: {
    providerId: "gemini" | "nvidia" | "openrouter";
    apiKey: string;
  }): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
  removeCredential(input: {
    providerId: "gemini" | "nvidia" | "openrouter";
  }): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
  context(input: ScopeSelection): Promise<ContextIdentity>;
  listConversations(): Promise<Conversation[]>;
  createConversation(input: {
    agentId?: string;
    contextBoxId: string;
    creationId: string;
  }): Promise<Conversation>;
  renameConversation(input: {
    conversationId: string;
    title: string;
  }): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  clearConversations(): Promise<void>;
  resumeConversation(id: string): Promise<Conversation>;
  refreshSource(): Promise<unknown>;
  chat(input: ChatRequest): Promise<ChatResult>;
  cancel(requestId?: string): Promise<boolean>;
  onEvent(callback: (event: ChatEvent) => void): () => void;
}
export type ModelCheckResult = {
  providerId: "gemini" | "nvidia" | "openrouter";
  model: string;
  passed: boolean;
  latencyMs: number;
  checkedAt: string;
  message: string;
  code?: string;
};
