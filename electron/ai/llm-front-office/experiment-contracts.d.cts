import type { ExperimentConfig } from "../../../types/front-office";
/** Validate a complete non-secret configuration; throws a safe runtime error. */
export function validateConfig(value: unknown): ExperimentConfig;
/** Return independently cloned defaults. */
export function defaultConfig(): ExperimentConfig;
