#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
.venv/bin/ruff format backend/
npx prettier@3 --write "frontend/**/*.{html,css,js}"
