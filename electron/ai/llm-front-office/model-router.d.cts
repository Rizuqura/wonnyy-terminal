import type {
  TaskRequirements,
  ModelProfile,
  ExperimentConfig,
  RoutingPlan,
} from "../../../types/front-office";
export { sortProfiles } from "./catalog-sort.cjs";
/** Select hard-eligible candidates, preserving manual pins. */
export function routeModels(
  requirements: TaskRequirements,
  profiles: ModelProfile[],
  evidence: unknown[],
  config: ExperimentConfig,
  isHealthy?: (id: string) => boolean,
): RoutingPlan;
