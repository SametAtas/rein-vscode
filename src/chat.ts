import type { ReinFinding } from "./types.js";

// Pure helpers for the @rein chat participant. Free of any vscode import so the
// code-extraction and formatting logic is unit-testable in plain Node; the
// participant handler in extension.ts is thin glue over these.

export type CodeSource = "prompt" | "selection" | "document";

export interface CodeSelection {
  code: string;
  source: CodeSource;
}

// Extract the first fenced code block from chat prompt text. Handles ``` and
// ~~~ fences with an optional language tag on the opening line. Returns the
// block's inner text (fences stripped) or null when there is no closed fence.
export function extractFencedCode(text: string): string | null {
  const lines = text.split(/\r?\n/);
  let fence: string | null = null;
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(lines[i]);
    if (fence === null) {
      if (marker) {
        fence = marker[1][0];
        start = i + 1;
      }
    } else if (marker && marker[1][0] === fence) {
      return lines.slice(start, i).join("\n");
    }
  }
  return null;
}

// Pick the code to review, in priority order: a fenced block in the chat
// prompt, else the editor selection, else the whole document. Whitespace-only
// candidates are skipped. Returns null when nothing reviewable is available.
export function selectReviewCode(
  prompt: string,
  selection: string | null,
  document: string | null,
): CodeSelection | null {
  const fenced = extractFencedCode(prompt);
  if (fenced !== null && fenced.trim() !== "") {
    return { code: fenced, source: "prompt" };
  }
  if (selection !== null && selection.trim() !== "") {
    return { code: selection, source: "selection" };
  }
  if (document !== null && document.trim() !== "") {
    return { code: document, source: "document" };
  }
  return null;
}

const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

// Render rein findings as chat markdown. Honest framing: the code was reviewed
// with rein; nothing here claims to detect AI authorship.
export function formatFindings(findings: ReinFinding[]): string {
  if (findings.length === 0) {
    return "rein reviewed the code and found no issues.";
  }
  const sorted = [...findings].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
  const header = `rein reviewed the code and found ${findings.length} issue${
    findings.length === 1 ? "" : "s"
  }:`;
  const items = sorted.map((f) => {
    const loc = f.line === null ? "" : ` (line ${f.line})`;
    return `- **${f.severity}** \`${f.rule_id}\`${loc}: ${f.message}`;
  });
  return [header, "", ...items].join("\n");
}
