@echo off
rem Double-click to start SignalTrade (Windows)
cd /d "%~dp0"
set PY=python
where py >nul 2>nul && set PY=py -3
if not exist .venv\Scripts\python.exe (
  echo First start: setting things up. This takes about a minute...
  %PY% -m venv .venv || goto nopython
)
.venv\Scripts\python -m pip install -q --disable-pip-version-check -r requirements.txt || goto failed
.venv\Scripts\python app.py
goto end
:nopython
echo SignalTrade needs Python 3. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH" during install. Then double-click this file again.
pause
goto end
:failed
echo Setup failed. Check your internet connection and try again.
pause
:end
