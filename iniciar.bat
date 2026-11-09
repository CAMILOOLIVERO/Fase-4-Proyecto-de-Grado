@echo off
chcp 65001 >nul
title AlertaArroyo
cd /d "%~dp0"
echo ==============================================
echo   AlertaArroyo - iniciando el prototipo
echo ==============================================
where docker >/dev/null 2>nul
if errorlevel 1 (
  echo.
  echo [!] No se encontro Docker en este equipo.
  echo     1. Instala Docker Desktop: https://www.docker.com/products/docker-desktop/
  echo     2. Reinicia el equipo si el instalador lo pide.
  echo     3. Abre Docker Desktop y espera a que diga que esta corriendo.
  echo     4. Vuelve a hacer doble clic en este archivo.
  start https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)
docker info >/dev/null 2>nul
if errorlevel 1 (
  echo.
  echo [!] Docker esta instalado pero no esta corriendo.
  echo     Abre Docker Desktop, espera a que inicie y vuelve a ejecutar este archivo.
  pause
  exit /b 1
)
echo.
echo Construyendo y levantando (la primera vez puede tardar varios minutos)...
start "" /b cmd /c "timeout /t 25 >/dev/null & start http://localhost:3000"
docker compose up --build
pause
