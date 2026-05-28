#!/bin/bash
# Installs project dependencies for Claude Code on the web sessions so
# `vite`, `vitest`, `tsc`, etc. are immediately available on PATH.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install --no-audit --no-fund

BIN_DIR="$CLAUDE_PROJECT_DIR/node_modules/.bin"
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -d "$BIN_DIR" ]; then
  echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

echo "session-start: vitest $("$BIN_DIR/vitest" --version 2>/dev/null || echo 'not found')"
