@echo off
cd /d "%~dp0"
echo ============================================
echo   Creation de l'executable CurseurTrainee.exe
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installez la version LTS depuis https://nodejs.org
  echo puis relancez ce fichier.
  goto erreur
)

if not exist node_modules (
  echo Installation des dependances, cela peut prendre une minute...
  call npm.cmd install
  if errorlevel 1 goto erreur
)

echo Fabrication de l'executable, cela peut prendre quelques minutes...
call npm.cmd run dist
if errorlevel 1 goto erreur

echo.
echo Termine ! Le fichier CurseurTrainee.exe est dans le dossier "dist".
start "" "%~dp0dist"
pause
exit /b 0

:erreur
echo.
echo Une erreur est survenue. Les messages ci-dessus indiquent la cause.
pause
exit /b 1
