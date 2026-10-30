# Implemented request flows

Experimental chat is opt-in in Settings → LLM Backend / Front Office. The normal agent research path continues to use its existing context, policies, tools/planners and manual settings. The experiment path is explicit and context-free; it never calls the context orchestrator.

```mermaid
sequenceDiagram
    participant UI as Settings experiment UI
    participant IPC as Restricted preload and IPC
    participant Service as FrontOfficeService
    participant Store as Existing conversation and run stores
    participant Policy as Intake requirements budget and router
    participant Retry as ReliabilityController
    participant Client as Native or LiteLLM HTTP client
    participant API as Permitted provider
    UI->>IPC: Text request, IDs, task and transport
    IPC->>Service: Compatible owner-scoped request
    Service->>Store: Read explicit experiment and full successful history
    Service->>Policy: Validated text messages and non-secret configuration
    Policy-->>Service: Eligible route, budget, rationale or rejection
    Service-->>UI: Start and routing decision
    Service->>Retry: One total deadline and cumulative attempt budget
    loop Bounded attempts before any partial text
        Retry->>Client: Chosen permitted deployment and AbortSignal
        Client->>API: Messages and generation settings only
        API-->>Client: SSE text, usage and finish reason
        Client-->>Service: Observed content callbacks
        Service-->>UI: Request-scoped deltas and visible attempts
    end
    Service->>Service: Validate finish and JSON schema without repair calls
    Service->>Store: Publish schema-3 run and apply to schema-5 conversation
    Service->>Store: Retain content-free metrics with activity pruning
    Service-->>UI: Usage, validation and terminal event
```

```mermaid
flowchart LR
    UI[Settings Basic and Advanced UI] --> IPC[Restricted bridge]
    IPC --> Service[FrontOfficeService]
    Service --> Intake[Intake and full history]
    Intake --> Requirements[Deterministic requirements]
    Requirements --> Router[Capability router and budget]
    Catalog[Catalog overrides and evidence] --> Router
    Router --> Reliability[Deadline retry circuit and permitted fallback]
    Reliability --> Gateway[Provider-neutral client]
    Gateway --> Native[Native OpenRouter or NVIDIA]
    Gateway --> Proxy[Optional authenticated loopback LiteLLM]
    Proxy --> Provider[Explicit provider deployment]
    Gateway --> Processor[Response validation]
    Processor --> Store[Existing run and conversation stores]
    Store --> Metrics[Content-free retention and export]
    Harness[Controlled evaluation harness] --> Gateway
    Harness --> Evidence[Inspectable live evidence records]
    Evidence --> Catalog
```

Normal agent chat still flows through ChatService → context orchestrator → existing provider adapter → existing response validation/run store. Its passive baseline observer records before-provider-translation estimates and per-call timings without changing model choice. Those runs use mode existing-agent-baseline and are not confused with context-free A experiments.

No Next API server, new conversation database, hosted telemetry, agent classifier or automatically launched Python service is added. The optional proxy process is externally managed. Cancellation shares existing owner-scoped admission; stale renderer events are ignored by request ID. Closing Settings stops its active experiment.

See [module contracts](02-modules-and-contracts.md), [providers](03-provider-setup-openrouter-nvidia.md), [ranking](04-model-registry-and-ranking.md), [budgets](05-token-economics-and-context.md), [reliability](06-reliability-errors-and-recovery.md), [metrics/evaluation](07-observability-and-benchmark.md), [tuning](08-front-office-tuning-playbook.md) and [rollback](09-security-and-rollback.md).
