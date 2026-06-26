# rein for VS Code

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/sametatas.rein?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=sametatas.rein)
[![Open VSX](https://img.shields.io/open-vsx/v/sametatas/rein?label=Open%20VSX)](https://open-vsx.org/extension/sametatas/rein)
[![CI](https://github.com/SametAtas/rein-vscode/actions/workflows/ci.yml/badge.svg)](https://github.com/SametAtas/rein-vscode/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

Runs the [rein](https://rein.software) engine on your Python files and shows its
findings inline: leaked secrets, unsafe-code patterns, clean-code lint, and
imports that do not resolve. rein is deterministic and makes no network or LLM
calls. This extension is a thin client: it shells out to the local `rein`
binary and renders what it reports. No detection logic lives in the extension.

![rein findings shown inline in VS Code](https://raw.githubusercontent.com/SametAtas/rein-vscode/main/images/diagnostics.png)

## Requirements

The engine is not bundled. Install it once:

```sh
pipx install rein-engine
```

If `rein` is not on your PATH, set `rein.path` to its location. When the engine
is absent the extension stays quiet and offers the install command; it never
blocks the editor.

## What it does

- Reviews the active Python file on open and on save (configurable), and on
  demand via `rein: Review Current File`.
- Maps each finding to a diagnostic in the Problems panel and as an inline
  marker: CRITICAL and HIGH to Error, MEDIUM to Warning, LOW to Information,
  INFO to Hint. A status-bar item shows the active file's count.
- Reviews a whole workspace, the staged git diff, or the Source Control commit
  message, on demand.
- Fails open: a missing, slow, or failing engine yields no diagnostics rather
  than an error.

## Commands

| Command | Action |
| --- | --- |
| `rein: Review Current File` | Review the active Python file. |
| `rein: Review Workspace` | Review every Python file in the workspace. |
| `rein: Review Staged Changes` | Review added lines in the staged git diff. |
| `rein: Check Commit Message` | Check the Source Control commit message. |
| `rein: Show Log` | Open the rein output channel. |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `rein.enable` | `true` | Enable diagnostics. |
| `rein.path` | `""` | Path to `rein` (empty searches PATH). |
| `rein.run` | `onSaveAndOpen` | When to review: `onSaveAndOpen`, `onSave`, or `manual`. |
| `rein.explain` | `true` | Include remediation guidance (`--explain`). |
| `rein.severityThreshold` | `info` | Hide findings below this severity. |
| `rein.extraArgs` | `[]` | Extra arguments for `rein review`, e.g. `["--bandit"]`. |
| `rein.baseline` | `""` | A baseline file to suppress known findings. |
| `rein.configPath` | `""` | A `.rein.toml` config file. |
| `rein.maxFileSizeKB` | `1024` | Skip files larger than this. |

## How it works

The extension calls `rein review --format json` for files and the workspace,
`rein review --diff` for the staged diff, and `rein commit-check` for the commit
message, then maps the JSON findings to editor diagnostics. Because every
verdict comes from the engine, the editor shows exactly what `rein` would report
on the command line or in CI.

## Links

- Engine and docs: [rein.software](https://rein.software)
- Engine source: [github.com/SametAtas/rein](https://github.com/SametAtas/rein)
- Extension source and issues: [github.com/SametAtas/rein-vscode](https://github.com/SametAtas/rein-vscode)

## License

Apache-2.0.
