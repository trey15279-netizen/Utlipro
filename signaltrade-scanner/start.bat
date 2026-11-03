@echo off
rem Double-click to start SignalTrade on Windows.
rem The first time, it sets itself up and adds a SignalTrade icon to your desktop.
cd /d "%~dp0"
set "PY=python"
where py >nul 2>nul && set "PY=py -3"
if not exist ".venv\Scripts\pythonw.exe" (
  echo Setting up SignalTrade for the first time. This takes about a minute...
  %PY% -m venv .venv || goto nopython
)
".venv\Scripts\python.exe" -m pip install -q --disable-pip-version-check -r requirements.txt || goto failed
if not exist "%USERPROFILE%\Desktop\SignalTrade.lnk" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\SignalTrade.lnk'); $s.TargetPath='%CD%\.venv\Scripts\pythonw.exe'; $s.Arguments='app.py'; $s.WorkingDirectory='%CD%'; $s.IconLocation='%CD%\static\icons\signaltrade.ico'; $s.Description='SignalTrade Scanner'; $s.Save()" >nul 2>nul
  if exist "%USERPROFILE%\Desktop\SignalTrade.lnk" echo Added a SignalTrade icon to your desktop. Use it next time.
)
start "" ".venv\Scripts\pythonw.exe" app.py
exit /b 0

:nopython
echo.
echo SignalTrade needs Python 3. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH" during the install. Then double-click this file again.
start "" https://www.python.org/downloads/
pause
exit /b 1

:failed
echo.
echo Setup failed. Check your internet connection and try again.
pause
exit /b 1
