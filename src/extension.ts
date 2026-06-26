import * as vscode from "vscode";
import * as path from "node:path";
import { findRein, run } from "./runner.js";
import { parseFindings } from "./parse.js";
import { buildDiagnostics, groupByPath } from "./diagnostics.js";
import { selectReviewCode, formatFindings } from "./chat.js";
import { formatToolSummary } from "./tool.js";
import type { ReinToolInput } from "./tool.js";
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
    vscode.commands.registerCommand("rein.reviewWorkspace", () => void reviewWorkspace()),
    vscode.commands.registerCommand("rein.reviewStaged", () => void reviewStaged()),
    vscode.commands.registerCommand("rein.checkCommitMessage", () => void checkCommitMessage()),
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
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
    vscode.window.onDidChangeActiveTextEditor(() => updateStatus()),
  );

  // B1: the @rein chat participant. Guarded so a host without the chat API
  // (or a registration failure) never breaks the M1-M4 diagnostics.
  try {
    const participant = vscode.chat.createChatParticipant("rein.review", handleChat);
    context.subscriptions.push(participant);
  } catch (err) {
    output.appendLine(`rein: chat participant unavailable: ${String(err)}`);
  }

  // B2: the rein_review language model tool the agent calls on code it writes.
  // Guarded the same way so a host without the lm tool API cannot break M1-M4.
  try {
    context.subscriptions.push(vscode.lm.registerTool("rein_review", reinTool));
  } catch (err) {
    output.appendLine(`rein: language model tool unavailable: ${String(err)}`);
  }

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

function threshold(): ThresholdName {
  return config().get<ThresholdName>("severityThreshold", "info");
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

// --- M1: single-file review on open/save/command ---

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
  const cwd = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath ?? path.dirname(filePath);
  const res = await run(bin, ["review", filePath, "--format", "json", ...reviewFlags(cfg)], { cwd });
  if (!ok(res, filePath)) {
    return;
  }
  const findings = parseFindings(res.stdout).filter(
    (f) => f.path === null || path.resolve(f.path) === path.resolve(filePath),
  );
  collection.set(doc.uri, buildDiagnostics(findings, threshold()));
  updateStatus();
}

// --- M2: whole-workspace review ---

async function reviewWorkspace(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    void vscode.window.showInformationMessage("rein: open a folder to review a workspace.");
    return;
  }
  const bin = await resolveRein(true);
  if (bin === null) {
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "rein: reviewing workspace" },
    async () => {
      collection.clear();
      let total = 0;
      for (const folder of folders) {
        const root = folder.uri.fsPath;
        const res = await run(bin, ["review", root, "--format", "json", ...reviewFlags(config())], {
          cwd: root,
          timeoutMs: 120000,
        });
        if (!ok(res, root)) {
          continue;
        }
        const byPath = groupByPath(parseFindings(res.stdout));
        for (const [p, findings] of byPath) {
          collection.set(vscode.Uri.file(p), buildDiagnostics(findings, threshold()));
          total += findings.length;
        }
      }
      void vscode.window.showInformationMessage(`rein: ${total} finding(s) across the workspace.`);
    },
  );
  updateStatus();
}

// --- M3: staged-diff gate ---

async function reviewStaged(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showInformationMessage("rein: open a git repository to review staged changes.");
    return;
  }
  const bin = await resolveRein(true);
  if (bin === null) {
    return;
  }
  const root = folder.uri.fsPath;
  const diff = await run("git", ["diff", "--staged", "--no-color"], { cwd: root });
  if (diff.spawnError) {
    void vscode.window.showWarningMessage("rein: could not run git for staged changes.");
    return;
  }
  if (diff.stdout.trim() === "") {
    void vscode.window.showInformationMessage("rein: no staged changes to review.");
    return;
  }
  const res = await run(bin, ["review", "--diff", "--format", "json", ...reviewFlags(config())], {
    cwd: root,
    stdin: diff.stdout,
  });
  if (!ok(res, "staged diff")) {
    return;
  }
  collection.clear();
  const byPath = groupByPath(
    parseFindings(res.stdout).map((f) => ({
      ...f,
      path: f.path ? path.resolve(root, f.path) : null,
    })),
  );
  let total = 0;
  for (const [p, findings] of byPath) {
    collection.set(vscode.Uri.file(p), buildDiagnostics(findings, threshold()));
    total += findings.length;
  }
  void vscode.window.showInformationMessage(`rein: ${total} finding(s) on staged changes.`);
}

// --- M4: commit-message check (reads the Source Control input box) ---

async function checkCommitMessage(): Promise<void> {
  const message = gitInputBoxValue();
  if (message === null || message.trim() === "") {
    void vscode.window.showInformationMessage("rein: the commit message box is empty.");
    return;
  }
  const bin = await resolveRein(true);
  if (bin === null) {
    return;
  }
  const res = await run(bin, ["commit-check", "-m", message, "--format", "json"]);
  if (!ok(res, "commit message")) {
    return;
  }
  const findings = parseFindings(res.stdout);
  if (findings.length === 0) {
    void vscode.window.showInformationMessage("rein: commit message is clean.");
    return;
  }
  void vscode.window.showWarningMessage(
    `rein: ${findings.map((f) => `${f.severity} ${f.rule_id}: ${f.message}`).join(" | ")}`,
  );
}

interface GitInputBox {
  value: string;
}
interface GitRepository {
  inputBox: GitInputBox;
}
interface GitApi {
  repositories: GitRepository[];
}
interface GitExtensionExports {
  getAPI(version: number): GitApi;
}

function gitInputBoxValue(): string | null {
  const ext = vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  const repo = ext?.exports?.getAPI(1)?.repositories?.[0];
  return repo ? repo.inputBox.value : null;
}

// --- B1: @rein chat participant (review code in the AI conversation) ---

async function handleChat(
  request: vscode.ChatRequest,
  _context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  _token: vscode.CancellationToken,
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const selection =
    editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : null;
  const document = editor ? editor.document.getText() : null;
  const picked = selectReviewCode(request.prompt, selection, document);
  if (picked === null) {
    stream.markdown(
      "rein: select some code, open a file, or paste a fenced code block, then ask `@rein review`.",
    );
    return;
  }
  const bin = await resolveRein(true);
  if (bin === null) {
    stream.markdown("rein engine not found. Install it with `pipx install rein-engine`.");
    return;
  }
  const filename =
    picked.source === "prompt" || !editor ? "snippet.py" : editor.document.uri.fsPath;
  const cwd =
    (editor ? vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath : undefined) ??
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const res = await run(
    bin,
    ["review", "--stdin", "--filename", filename, "--format", "json", ...reviewFlags(config())],
    { cwd, stdin: picked.code },
  );
  if (!ok(res, "chat review")) {
    stream.markdown("rein: the review could not be completed. Run `rein: Show Log` for details.");
    return;
  }
  stream.markdown(formatFindings(parseFindings(res.stdout)));
}

// --- B2: rein_review language model tool (the agent checks its own code) ---

const reinTool: vscode.LanguageModelTool<ReinToolInput> = {
  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<ReinToolInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const code = typeof options.input?.code === "string" ? options.input.code : "";
    if (code.trim() === "") {
      return toolResult("rein: no code was provided to review.");
    }
    const bin = await resolveRein(true);
    if (bin === null) {
      return toolResult("rein engine not found. Install it with: pipx install rein-engine");
    }
    const raw = options.input.filename;
    const filename = typeof raw === "string" && raw.trim() !== "" ? raw : "snippet.py";
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const res = await run(
      bin,
      ["review", "--stdin", "--filename", filename, "--format", "json", ...reviewFlags(config())],
      { cwd, stdin: code },
    );
    if (!ok(res, "tool review")) {
      return toolResult("rein: the review could not be completed (engine error or timeout).");
    }
    return toolResult(formatToolSummary(parseFindings(res.stdout)));
  },
  prepareInvocation(): vscode.PreparedToolInvocation {
    return { invocationMessage: "Running rein..." };
  },
};

function toolResult(text: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

// --- shared helpers ---

function ok(res: Awaited<ReturnType<typeof run>>, label: string): boolean {
  if (res.spawnError || res.timedOut) {
    output.appendLine(`rein failed for ${label}: ${res.timedOut ? "timeout" : res.spawnError?.message}`);
    return false;
  }
  const t = res.stdout.trim();
  if (t !== "" && !t.startsWith("{") && !t.startsWith("[")) {
    output.appendLine(`rein unexpected output for ${label}: ${(res.stderr || res.stdout).slice(0, 500)}`);
    return false;
  }
  return true;
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
