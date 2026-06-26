# Changelog

## 0.2.0

- Add the `rein_review` language model tool: in agent mode the model can call
  it on Python code it writes or edits to check for leaked secrets, unsafe
  calls, and unresolved or hallucinated imports before finalizing. It pipes the
  code through `rein review --stdin` and returns the findings to fix. Same
  engine, same findings as the editor diagnostics; no new detection logic.
  Fails open when the engine is absent. Referenceable in prompts as `#rein`.

## 0.1.0

- Add the `@rein` chat participant: invoke `@rein review` in the chat view to
  review code in the conversation. It reviews, in priority order, a fenced code
  block in the prompt, the editor selection, or the current file, by piping the
  code through `rein review --stdin` (engine 0.3.2+). Same engine, same
  findings as the editor diagnostics; no new detection logic. Fails open when
  the engine is absent. Requires VS Code 1.95+.

## 0.0.3

- Positioning: the listing now leads with checking AI-written code (catching
  leaked secrets, unsafe calls, and hallucinated imports before it runs) rather
  than generic linting. Copy, keywords, and README only; no behavior change.

## 0.0.2

- Marketplace listing: badges, a screenshot, command and settings tables, and a
  "how it works" section. No behavior change.

## 0.0.1

- Initial release. Reviews Python files with the `rein` engine and shows
  findings as editor diagnostics (on open, on save, and via the
  `rein: Review Current File` command). Detects the engine on PATH or via
  `rein.path`, and fails open when it is absent.
