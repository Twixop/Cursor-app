@echo off
cd /d "%~dp0"
echo Lancement en mode test (sans .exe). Fermez cette fenetre ou faites Ctrl+C pour arreter.
call npm.cmd start
pause
