# Modules and contracts

The backend remains CommonJS in electron/ai/llm-front-office/, packaged by the existing Electron rules. Shared interfaces live in types/front-office.ts, runtime Zod contracts in experiment-contracts.cjs, and public TypeScript declarations beside core modules.

| Package | Actual module | Public boundary |
| --- | --- | --- |
| P01 Intake | request-intake.cjs | normalizeRequest: strict request and generation boundaries |
| P02 Requirements | request-intake.cjs | buildRequirements: deterministic task/modality/policy |
| P03 Conversation | conversation-manager.cjs plus existing ConversationStore | Explicit schema-5 mode, pairing, idempotency and recovery |
| P04 Budget | token-budget.cjs | checkBudget: full input + output + headroom, no truncation |
| P05 Registry | model-registry.cjs | CapabilityRegistry: cached catalog, overrides, favorites and evidence |
| P06 Long-context evidence | long-context-reliability.cjs | reliabilityProfile: fresh, matching, repeated measurements |
| P07 Router | model-router.cjs, catalog-sort.cjs | routeModels and shared deterministic sorter |
| P08 Gateway | provider-gateway.cjs | LLMClient.complete; native HTTP or optional authenticated LiteLLM |
| P09 Reliability | reliability.cjs | ReliabilityController.execute; one bounded retry owner |
| P10 Responses | response-processor.cjs | JSON schema definition/output validation without repairs |
| P11 Observability | observability.cjs, contracts.cjs, export.cjs, telemetry-store.cjs | Content-free traces and retention/export |
| P12 Evaluation | evaluation/fixtures.cjs and harness.cjs | 40-case A/B/C harness and uncertainty/report/export helpers |
| P13 Settings | features/model-settings/front-office-settings.tsx | Basic/advanced controls, capability catalog, inspector and experiment chat |

service.cjs connects these boundaries; ipc.cjs and preload.cjs expose deliberately named frontOffice methods through the existing versioned bridge. Every IPC call still requires the normal handshake. An old desktop bridge missing the additive methods prompts a restart.

NormalizedChatRequest carries conversation/request IDs, question, transport, explicit task and optional retry reference. TaskRequirements contains known text/format/token/policy constraints and explicitly unknown reliability/latency targets. BudgetDecision exposes input estimate, reserve, capacity, cost estimate and reasons. RoutingPlan contains eligible candidates, primary/fallbacks, score inputs, rationale and rejected candidates. LLMClient accepts messages, callbacks and AbortSignal and returns content, actual reported identity, finish reason, usage and optional reasoning counts.

Experiment events use start, routing, attempt, delta, usage, finish, error, cancelled and warning. Deltas are incremental text; existing normal-agent callbacks remain cumulative and unchanged. Renderer events are request-ID scoped. JSON/schema invalidity is explicitly reported; there is no extra correction call.

Schema 5 conversations and schema 3 runs use the existing stores. Normal agent lists exclude experiments, both execution paths gate mode, and recovery validates run/conversation/request identity. No second conversation database, Next server, Python sidecar or prompt-memory service is introduced.

The default normal-agent observer remains available separately. Its original before-provider-translation estimate boundary and orchestration timing labels are preserved. Experimental metrics span accepted service entry through validation before persistence, and include per-call pricing provenance, routing, history count and format validation.
