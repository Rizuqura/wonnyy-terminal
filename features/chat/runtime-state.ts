import type { ChatEvent, ChatState } from "../../types/ai";

export type RuntimeState = {
  state: ChatState;
  requestId: string | null;
  content: string;
  error: string | null;
  diagnostics: Record<string, unknown> | null;
};
export const initialRuntime: RuntimeState = {
  state: "IDLE",
  requestId: null,
  content: "",
  error: null,
  diagnostics: null,
};
export type RuntimeAction =
  | { type: "reset"; state?: ChatState }
  | { type: "start"; requestId: string }
  | { type: "event"; event: ChatEvent }
  | { type: "error"; message: string; state?: ChatState }
  | { type: "stop" }
  | { type: "finish" };

export function runtimeReducer(
  state: RuntimeState,
  action: RuntimeAction,
): RuntimeState {
  switch (action.type) {
    case "reset":
      return { ...initialRuntime, state: action.state ?? "IDLE" };
    case "start":
      return {
        ...initialRuntime,
        state: "PREPARING_CONTEXT",
        requestId: action.requestId,
      };
    case "stop":
      return state.requestId ? { ...state, state: "CANCELLING" } : state;
    case "finish":
      return {
        ...state,
        state: state.error ? state.state : "READY",
        requestId: null,
        content: "",
      };
    case "error":
      return {
        ...state,
        state: action.state ?? "ERROR",
        content: "",
        error: action.message,
      };
    case "event": {
      if (action.event.requestId !== state.requestId) return state;
      if (
        state.state === "CANCELLING" &&
        !["ERROR", "READY"].includes(action.event.state)
      )
        return state;
      return {
        ...state,
        state: action.event.state,
        content: ["ERROR", "READY"].includes(action.event.state)
          ? ""
          : (action.event.content ?? state.content),
        error: action.event.error?.message ?? state.error,
        diagnostics: action.event.diagnostics ?? state.diagnostics,
      };
    }
  }
}
