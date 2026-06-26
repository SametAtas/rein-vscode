// Shapes returned by the rein CLI. Kept free of any vscode import so the
// parsing and severity logic can be unit-tested in plain Node.

export type ReinSeverity =
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFO";

export interface ReinFinding {
  rule_id: string;
  severity: ReinSeverity;
  message: string;
  path: string | null;
  line: number | null;
  snippet: string | null;
  tags: string[];
  // Present when rein is run with --explain (field name may vary; tolerated).
  remediation?: string | null;
}

// `rein review --format json` returns this object; `rein commit-check
// --format json` returns a bare ReinFinding[]. parse() handles both.
export interface ReinReview {
  verdict: string;
  findings: ReinFinding[];
}
