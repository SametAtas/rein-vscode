import { spawn } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  spawnError: Error | null;
}

export interface RunOptions {
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
}

// Spawn a process, capture stdout/stderr, enforce a timeout, and never reject:
// failures (missing binary, timeout, crash) come back on the result so callers
// can fail open. vscode-free so it is testable in plain Node.
export function run(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(bin, args, { cwd: opts.cwd });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: null, timedOut, spawnError: err });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut, spawnError: null });
    });

    if (opts.stdin !== undefined) {
      child.stdin.end(opts.stdin);
    }
  });
}

// Resolve the rein binary: a configured path if it validates, else `rein` on
// PATH. Returns the working invocation name or null. Validation runs
// `<bin> --version` and checks it identifies as rein.
export async function findRein(configuredPath: string): Promise<string | null> {
  const candidates = configuredPath.trim() !== "" ? [configuredPath] : ["rein"];
  for (const bin of candidates) {
    const res = await run(bin, ["--version"], { timeoutMs: 5000 });
    if (res.spawnError === null && res.code === 0 && /\brein\b/i.test(res.stdout)) {
      return bin;
    }
  }
  return null;
}
