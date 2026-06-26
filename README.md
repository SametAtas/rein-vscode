# rein for VS Code

Inline guardrails for AI-written code, powered by the
[rein](https://rein.software) engine. The extension runs `rein` over your
Python files and shows its findings (leaked secrets, unsafe-code patterns,
clean-code lint, unresolved imports) as editor diagnostics. It is deterministic
and makes no LLM calls; all detection happens in the local `rein` engine.

## Requirements

This extension calls the `rein` engine; it does not bundle it. Install it once:

```
pipx install rein-engine
```

If `rein` is not on your PATH, set `rein.path` to its location.

## What it does

- Reviews the active Python file on open and save, and via the
  `rein: Review Current File` command.
- Shows findings in the Problems panel and as inline squiggles, with severity
  mapped from rein (CRITICAL/HIGH to Error, MEDIUM to Warning, LOW to
  Information, INFO to Hint).
- Fails open: if the engine is missing or errors, the editor is never blocked.

## Settings

- `rein.enable` - turn diagnostics on or off.
- `rein.path` - path to the `rein` executable (empty searches PATH).
- `rein.run` - `onSaveAndOpen`, `onSave`, or `manual`.
- `rein.explain` - include remediation guidance.
- `rein.severityThreshold` - hide findings below a severity.
- `rein.extraArgs` - extra arguments for `rein review` (e.g. `["--bandit"]`).
- `rein.baseline` - a rein baseline file to suppress known findings.
- `rein.configPath` - a `.rein.toml` config file.
- `rein.maxFileSizeKB` - skip files larger than this.

## License

Apache-2.0.
