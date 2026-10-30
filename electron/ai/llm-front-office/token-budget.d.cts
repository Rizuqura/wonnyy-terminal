import type {
  TaskRequirements,
  ModelProfile,
  ExperimentConfig,
  BudgetDecision,
} from "../../../types/front-office";
/** Pure preflight: rejects overflow instead of truncating. */
export function checkBudget(
  requirements: TaskRequirements,
  model: ModelProfile,
  config: ExperimentConfig,
): BudgetDecision;
