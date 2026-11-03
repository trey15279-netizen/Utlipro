#!/bin/bash
# Double-click to start SignalTrade (Mac). On Linux: ./start.command
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo "SignalTrade needs Python 3. Install it from https://www.python.org/downloads/"
  echo "then double-click this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
if [ ! -x .venv/bin/python ]; then
  echo "First start: setting things up. This takes about a minute..."
  python3 -m venv .venv || { read -r -p "Setup failed. Press Enter to close."; exit 1; }
fi
.venv/bin/python -m pip install -q --disable-pip-version-check -r requirements.txt \
  || { read -r -p "Setup failed. Check your internet connection. Press Enter to close."; exit 1; }
.venv/bin/python app.py
