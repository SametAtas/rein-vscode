import type { ReinSeverity } from "./types.js";

// Rank rein severities so a configured threshold can hide the rest. Kept
// vscode-free for unit testing; diagnostics.ts maps the rank to the editor's
// DiagnosticSeverity.
const RANK: Record<string, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export type ThresholdName = "info" | "low" | "medium" | "high" | "critical";

const THRESHOLD_RANK: Record<ThresholdName, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function severityRank(sev: string): number {
  return RANK[sev.toUpperCase()] ?? 0;
}

export function meetsThreshold(sev: string, threshold: ThresholdName): boolean {
  return severityRank(sev) >= THRESHOLD_RANK[threshold];
}

// 0 Error, 1 Warning, 2 Information, 3 Hint - matches vscode.DiagnosticSeverity
// numeric values, but diagnostics.ts maps explicitly rather than relying on it.
export function severityToDiagnostic(sev: ReinSeverity | string): 0 | 1 | 2 | 3 {
  switch (sev.toUpperCase()) {
    case "CRITICAL":
    case "HIGH":
      return 0;
    case "MEDIUM":
      return 1;
    case "LOW":
      return 2;
    default:
      return 3;
  }
}
