"""
AirPaint — Servidor de Reconocimiento de Voz con Vosk
=====================================================
Servidor WebSocket que recibe audio PCM del navegador,
lo procesa con Vosk offline y devuelve comandos matcheados
contra el archivo commands.yaml.

Uso: python vosk_server.py
Puerto: 2700 (configurable)
"""

import asyncio
import json
import os
import sys
import yaml
from vosk import Model, KaldiRecognizer
import websockets

# Forzar UTF-8 en consola Windows
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ─────────────── CONFIGURACIÓN ───────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(SCRIPT_DIR, "vosk-model-small-es-0.42")
COMMANDS_PATH = os.path.join(SCRIPT_DIR, "commands.yaml")
HOST = "0.0.0.0"
PORT = 2700
SAMPLE_RATE = 16000

# Estado mutable del módulo
_state = {"model": None, "alias_index": {}}


def load_commands(path):
    """Carga commands.yaml y construye un índice invertido alias → acción."""
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    alias_index = {}
    commands_list = data.get("commands", [])

    for cmd in commands_list:
        action = cmd["action"]
        display = cmd["display"]
        category = cmd.get("category", "")
        for alias in cmd.get("aliases", []):
            # Normalizar: minúsculas, sin acentos problemáticos
            normalized = alias.lower().strip()
            alias_index[normalized] = {
                "action": action,
                "display": display,
                "category": category,
            }

    print(f"  ✅ {len(commands_list)} comandos cargados con {len(alias_index)} aliases")
    return alias_index


def match_command(text, alias_index):
    """
    Busca coincidencias en el texto reconocido.
    Estrategia de matching:
      1. Coincidencia exacta del texto completo
      2. Buscar el alias más largo contenido en el texto
    """
    text_lower = text.lower().strip()

    # 1) Coincidencia exacta
    if text_lower in alias_index:
        return alias_index[text_lower]

    # 2) Buscar alias contenidos en el texto (priorizando los más largos)
    best_match = None
    best_len = 0

    for alias, cmd_info in alias_index.items():
        if alias in text_lower and len(alias) > best_len:
            best_match = cmd_info
            best_len = len(alias)

    return best_match


# ─────────────── SERVIDOR WEBSOCKET ───────────────
async def handle_client(websocket):
    """Maneja cada conexión WebSocket de un cliente del navegador."""
    print(f"  📡 Cliente conectado: {websocket.remote_address}")

    recognizer = KaldiRecognizer(_state["model"], SAMPLE_RATE)
    recognizer.SetWords(True)

    try:
        async for message in websocket:
            # Si recibimos datos binarios (audio PCM)
            if isinstance(message, bytes):
                if recognizer.AcceptWaveform(message):
                    result = json.loads(recognizer.Result())
                    text = result.get("text", "").strip()

                    if text:
                        print(f"  🎤 Reconocido: \"{text}\"")
                        cmd = match_command(text, _state["alias_index"])

                        response = {
                            "type": "result",
                            "text": text,
                        }

                        if cmd:
                            response["matched"] = True
                            response["action"] = cmd["action"]
                            response["display"] = cmd["display"]
                            response["category"] = cmd["category"]
                            print(f"  ✨ Comando: {cmd['display']} → {cmd['action']}")
                        else:
                            response["matched"] = False

                        await websocket.send(json.dumps(response))
                else:
                    # Resultado parcial (mientras habla)
                    partial = json.loads(recognizer.PartialResult())
                    partial_text = partial.get("partial", "").strip()

                    if partial_text:
                        await websocket.send(json.dumps({
                            "type": "partial",
                            "text": partial_text,
                        }))

            # Si recibimos texto (comando de control)
            elif isinstance(message, str):
                try:
                    ctrl = json.loads(message)
                    if ctrl.get("command") == "reload":
                        _state["alias_index"] = load_commands(COMMANDS_PATH)
                        await websocket.send(json.dumps({
                            "type": "info",
                            "message": "Comandos recargados"
                        }))
                except json.JSONDecodeError:
                    pass

    except websockets.exceptions.ConnectionClosed:
        print(f"  📴 Cliente desconectado: {websocket.remote_address}")
    except Exception as e:
        print(f"  ❌ Error con cliente: {e}")


async def main():
    """Punto de entrada principal del servidor."""

    print()
    print("=" * 55)
    print("  🎨 AirPaint — Servidor de Voz Vosk")
    print("=" * 55)
    print()

    # Cargar modelo Vosk
    print(f"  📂 Cargando modelo: {MODEL_PATH}")
    if not os.path.exists(MODEL_PATH):
        print(f"  ❌ ERROR: Modelo no encontrado en {MODEL_PATH}")
        print(f"     Descarga: https://alphacephei.com/vosk/models")
        sys.exit(1)

    _state["model"] = Model(MODEL_PATH)
    print("  ✅ Modelo Vosk cargado exitosamente")
    print()

    # Cargar comandos
    print(f"  📂 Cargando comandos: {COMMANDS_PATH}")
    if not os.path.exists(COMMANDS_PATH):
        print(f"  ❌ ERROR: Archivo de comandos no encontrado: {COMMANDS_PATH}")
        sys.exit(1)

    _state["alias_index"] = load_commands(COMMANDS_PATH)
    print()

    # Iniciar servidor WebSocket
    print(f"  🌐 Iniciando servidor WebSocket en ws://{HOST}:{PORT}")
    print(f"  📢 Esperando conexiones del navegador...")
    print()
    print("=" * 55)
    print()

    async with websockets.serve(
        handle_client,
        HOST,
        PORT,
        max_size=None,  # Sin límite de tamaño de mensaje
        ping_interval=30,
        ping_timeout=10,
    ):
        await asyncio.Future()  # Ejecutar indefinidamente


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n  🛑 Servidor detenido por el usuario.")
