import type { ModelProfile } from "../../../types/front-office";
/** Sort a new array; missing evidence is never ranked as measured quality. */
export function sortProfiles<
  T extends Partial<ModelProfile> & {
    deploymentId: string;
    providerId: string;
    contextTokens: number | null;
    maxOutputTokens: number | null;
    inputUsdPerMillion: number | null;
  },
>(profiles: T[], sort?: string): T[];
