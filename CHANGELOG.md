# Changelog

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
