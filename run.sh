#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Installing dependencies…"
pip install -r "$ROOT/backend/requirements.txt" -q

echo "Starting QuickRes on http://localhost:8000"
cd "$ROOT/backend"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
