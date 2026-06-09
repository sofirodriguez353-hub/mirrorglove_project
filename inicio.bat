@echo off
title MirrorGlove - Iniciando...

cls
echo.
echo  ============================================
echo    MirrorGlove - Arte con Micro:bit
echo    + Comandos de Voz + Perfil Parkinson
echo  ============================================
echo.
echo  Verificando requisitos del sistema...
echo.

:: Verificar Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js no esta instalado.
    echo.
    echo  Por favor instala Node.js desde:
    echo  https://nodejs.org/
    echo.
    echo  Presiona cualquier tecla para abrir la pagina de descarga...
    pause >nul
    start https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  Node.js encontrado: %NODE_VER%

:: Verificar Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  AVISO: Python no encontrado. Comandos de voz no disponibles.
    echo  Instala Python desde: https://python.org/
    goto :start_node
)

for /f "tokens=*" %%v in ('python --version') do set PY_VER=%%v
echo  %PY_VER% encontrado

:: Instalar dependencias Python si es necesario
echo.
echo  Verificando dependencias Python...
python -c "import vosk" >nul 2>&1
if %errorlevel% neq 0 (
    echo  Instalando vosk...
    pip install vosk >nul 2>&1
)
python -c "import websockets" >nul 2>&1
if %errorlevel% neq 0 (
    echo  Instalando websockets...
    pip install websockets >nul 2>&1
)
python -c "import yaml" >nul 2>&1
if %errorlevel% neq 0 (
    echo  Instalando pyyaml...
    pip install pyyaml >nul 2>&1
)
echo  Dependencias Python OK

:: Iniciar servidor Vosk en segundo plano
echo.
echo  Iniciando servidor de voz Vosk (puerto 2700)...
start "MirrorGlove - Vosk Voice Server" /min cmd /c "python vosk_server.py"
timeout /t 3 /nobreak >nul

:start_node
echo.
echo  Iniciando servidor web MirrorGlove (puerto 5000)...
echo  URL: http://localhost:5000
echo.
echo  =============================================
echo   Presiona Ctrl+C para detener el servidor
echo  =============================================
echo.

:: Esperar 2 segundos y abrir el navegador
timeout /t 2 /nobreak >nul
start "" "http://localhost:5000"

:: Iniciar el servidor Node.js
node server.js

:: Si el servidor termina, mostrar mensaje
echo.
echo  El servidor se ha detenido.
pause
