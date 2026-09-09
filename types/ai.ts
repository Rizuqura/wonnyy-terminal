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
export type Conversation = {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  contextIdentity: ContextIdentity;
  messages: ChatMessage[];
  attempts: ChatAttempt[];
};
export type ChatState =
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
  providerId: "ollama" | "gemini" | "nvidia";
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
  content?: string;
  conversation?: Conversation;
  error?: ModelRuntimeErrorValue;
  diagnostics?: Record<string, unknown>;
};
export interface AiBridge {
  checkRemoteModel(input: {
    providerId: "gemini" | "nvidia";
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
    providerId: "gemini" | "nvidia";
    apiKey: string;
  }): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
  removeCredential(input: {
    providerId: "gemini" | "nvidia";
  }): Promise<{ configured: boolean; secureStorageAvailable: boolean }>;
  context(input: ScopeSelection): Promise<ContextIdentity>;
  listConversations(): Promise<Conversation[]>;
  createConversation(input: ScopeSelection): Promise<Conversation>;
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
  providerId: "gemini" | "nvidia";
  model: string;
  passed: boolean;
  latencyMs: number;
  checkedAt: string;
  message: string;
  code?: string;
};
