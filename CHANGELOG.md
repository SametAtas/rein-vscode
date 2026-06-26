# Changelog

## 0.0.1

- Initial release. Reviews Python files with the `rein` engine and shows
  findings as editor diagnostics (on open, on save, and via the
  `rein: Review Current File` command). Detects the engine on PATH or via
  `rein.path`, and fails open when it is absent.
