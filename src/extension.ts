import * as vscode from "vscode";
import * as path from "node:path";
import { findRein, run } from "./runner.js";
import { parseFindings } from "./parse.js";
import { buildDiagnostics } from "./diagnostics.js";
import type { ThresholdName } from "./severity.js";

let output: vscode.OutputChannel;
let collection: vscode.DiagnosticCollection;
let status: vscode.StatusBarItem;
let reinBin: string | null = null;
let resolved = false;
let promptedMissing = false;
const pending = new Map<string, NodeJS.Timeout>();

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("rein");
  collection = vscode.languages.createDiagnosticCollection("rein");
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  status.command = "rein.reviewFile";
  context.subscriptions.push(output, collection, status);

  context.subscriptions.push(
    vscode.commands.registerCommand("rein.reviewFile", () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc) {
        void reviewDocument(doc, true);
      }
    }),
    vscode.commands.registerCommand("rein.showOutput", () => output.show()),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (runMode() === "onSaveAndOpen") {
        debounce(doc);
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (runMode() !== "manual") {
        debounce(doc);
      }
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      collection.delete(doc.uri);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatus()),
  );

  const active = vscode.window.activeTextEditor?.document;
  if (active && runMode() === "onSaveAndOpen") {
    debounce(active);
  }
  updateStatus();
}

export function deactivate(): void {
  for (const t of pending.values()) {
    clearTimeout(t);
  }
  pending.clear();
}

function config(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("rein");
}

function runMode(): string {
  return config().get<string>("run", "onSaveAndOpen");
}

function debounce(doc: vscode.TextDocument): void {
  if (doc.languageId !== "python") {
    return;
  }
  const key = doc.uri.toString();
  const existing = pending.get(key);
  if (existing) {
    clearTimeout(existing);
  }
  pending.set(
    key,
    setTimeout(() => {
      pending.delete(key);
      void reviewDocument(doc, false);
    }, 300),
  );
}

async function reviewDocument(doc: vscode.TextDocument, manual: boolean): Promise<void> {
  const cfg = config();
  if (!cfg.get<boolean>("enable", true) || doc.languageId !== "python" || doc.uri.scheme !== "file") {
    return;
  }
  const maxKB = cfg.get<number>("maxFileSizeKB", 1024);
  if (Buffer.byteLength(doc.getText(), "utf8") > maxKB * 1024) {
    output.appendLine(`skip ${doc.uri.fsPath}: larger than ${maxKB} KB`);
    return;
  }

  const bin = await resolveRein(manual);
  if (bin === null) {
    return;
  }

  const filePath = doc.uri.fsPath;
  const args = ["review", filePath, "--format", "json", ...reviewFlags(cfg)];
  const cwd = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? path.dirname(filePath);
  const res = await run(bin, args, { cwd, timeoutMs: 10000 });

  if (res.spawnError || res.timedOut) {
    output.appendLine(`run failed for ${filePath}: ${res.timedOut ? "timeout" : res.spawnError?.message}`);
    return;
  }
  const findings = parseFindings(res.stdout);
  if (findings.length === 0 && res.stdout.trim() !== "" && !looksLikeJson(res.stdout)) {
    output.appendLine(`unexpected output for ${filePath}: ${res.stderr || res.stdout}`.slice(0, 500));
  }
  const threshold = cfg.get<ThresholdName>("severityThreshold", "info");
  const fileFindings = findings.filter((f) => f.path === null || path.resolve(f.path) === path.resolve(filePath));
  collection.set(doc.uri, buildDiagnostics(fileFindings, doc, threshold));
  updateStatus();
}

function reviewFlags(cfg: vscode.WorkspaceConfiguration): string[] {
  const flags: string[] = [];
  if (cfg.get<boolean>("explain", true)) {
    flags.push("--explain");
  }
  const baseline = cfg.get<string>("baseline", "").trim();
  if (baseline !== "") {
    flags.push("--baseline", baseline);
  }
  const configPath = cfg.get<string>("configPath", "").trim();
  if (configPath !== "") {
    flags.push("--config", configPath);
  }
  flags.push(...cfg.get<string[]>("extraArgs", []));
  return flags;
}

async function resolveRein(manual: boolean): Promise<string | null> {
  if (!resolved) {
    reinBin = await findRein(config().get<string>("path", ""));
    resolved = true;
  }
  if (reinBin === null && (manual || !promptedMissing)) {
    promptedMissing = true;
    void promptInstall();
  }
  return reinBin;
}

async function promptInstall(): Promise<void> {
  const pick = await vscode.window.showWarningMessage(
    "rein engine not found. Install it to enable diagnostics.",
    "Copy install command",
    "Set rein.path",
  );
  if (pick === "Copy install command") {
    await vscode.env.clipboard.writeText("pipx install rein-engine");
    void vscode.window.showInformationMessage("Copied: pipx install rein-engine");
  } else if (pick === "Set rein.path") {
    await vscode.commands.executeCommand("workbench.action.openSettings", "rein.path");
  }
}

function looksLikeJson(s: string): boolean {
  const t = s.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function updateStatus(): void {
  const doc = vscode.window.activeTextEditor?.document;
  if (reinBin === null && resolved) {
    status.text = "$(shield) rein: not installed";
    status.show();
    return;
  }
  if (!doc || doc.languageId !== "python") {
    status.hide();
    return;
  }
  const count = collection.get(doc.uri)?.length ?? 0;
  status.text = count > 0 ? `$(shield) rein: ${count}` : "$(shield) rein: clean";
  status.show();
}
