# Estructura del proyecto Art-microbitv2

Este documento describe cada archivo y carpeta del proyecto para facilitar su comprensión y mantenimiento.

## Archivos principales

- `index.html`
  - Página web principal de la aplicación.
  - Contiene la estructura HTML del lienzo, controles, paneles y botones para conectar el Micro:bit.
  - Es la interfaz que se sirve desde `server.js`.

- `style.css`
  - Estilos visuales de la aplicación.
  - Define el diseño, colores, animaciones, tema infantil y la apariencia del lienzo y controles.

- `app.js`
  - Lógica principal del frontend.
  - Maneja la conexión Bluetooth/USB al Micro:bit, la lectura de sensores, el dibujo en canvas y la interacción del usuario.
  - Controla también el módulo de reconocimiento de voz mediante WebSocket y la configuración cargada desde `config.json`.

- `config.json`
  - Archivo de configuración de la aplicación.
  - Incluye metadatos de la app (`name`, `subtitle`, `authors`, `school`, `year`, etc.), parámetros de Bluetooth, ajustes de dibujo y preferencias de UI.
  - Permite cambiar colores, tamaños, sensibilidad y mapeos de gestos sin modificar código.

- `server.js`
  - Servidor HTTP local simple en Node.js.
  - Entrega los archivos estáticos del proyecto (`index.html`, `style.css`, `app.js`, `config.json`, etc.) en el puerto `5000`.
  - También maneja la detección de tipos MIME y seguridad básica de ruta.

- `package.json`
  - Metadatos del proyecto Node.js.
  - Define el nombre, versión, descripción y el script `start` para iniciar `server.js`.
  - Es útil para ejecutar la app con `npm start`.

- `inicio.bat`
  - Script de Windows para iniciar la aplicación de forma conveniente.
  - Normalmente ejecuta el servidor local o abre la aplicación desde el entorno Windows.

- `Micro-Art.hex`
  - Firmware o binario para el Micro:bit.
  - Contiene el código que debe cargarse en el Micro:bit para enviar datos de sensor y gestos a la aplicación.

## Archivos de documentación

- `DOCUMENTACION.md`
  - Documentación general del proyecto.
  - Probablemente contiene objetivos, alcance, uso y explicaciones técnicas.

- `GUIA_NINAS.md`
  - Guía dirigida a niñas, posiblemente con instrucciones o contenido educativo para el uso del proyecto.

- `implementation_plan.md`
  - Plan de implementación o cronograma del proyecto.
  - Detalla las fases, tareas y posiblemente la distribución del trabajo.

- `implementation_plan2`
  - Otro documento de planificación, posiblemente una versión alternativa o complementaria del plan.

- `resumen_integracion.md`
  - Resumen del proceso de integración del proyecto.
  - Puede incluir resultados, pruebas, integración de hardware/software y evaluación final.

## Reconocimiento de voz y comandos

- `commands.yaml`
  - Lista de comandos de voz para el reconocimiento Vosk en español.
  - Define la acción interna (`action`), el texto visible (`display`), la categoría (`category`) y variaciones fonéticas (`aliases`).
  - Es el archivo que lee `vosk_server.py` para mapear el texto reconocido a acciones de la app.

- `vosk_server.py`
  - Servidor de reconocimiento de voz offline usando Vosk.
  - Recibe audio PCM por WebSocket desde el navegador, lo procesa con el modelo Vosk y devuelve el comando detectado.
  - Soporta recarga dinámica de comandos desde `commands.yaml`.

## Carpeta del modelo Vosk

- `vosk-model-small-es-0.42/`
  - Modelo de reconocimiento de voz en español para Vosk.
  - Se usa en `vosk_server.py` para reconocer comandos hablados.

Dentro de esta carpeta hay subcarpetas clave:

- `am/`
  - Modelos acústicos.

- `conf/`
  - Archivos de configuración del modelo Vosk.

- `graph/`
  - Grafos y estructuras de búsqueda del modelo.

- `ivector/`
  - Datos para adaptación y características de audio.

- `README`
  - Instrucciones específicas del modelo Vosk.

## Observaciones generales

- El proyecto combina una aplicación web (`index.html`, `style.css`, `app.js`) con conectividad de hardware (`Micro-Art.hex` y Micro:bit) y reconocimiento de voz (`vosk_server.py`, `commands.yaml`).
- `config.json` centraliza parámetros de presentación, Bluetooth, dibujo y gestos, lo que permite ajustar la experiencia sin editar JavaScript.
- `server.js` es la forma más fácil de ejecutar la app en un navegador local con Web Bluetooth.
- La carpeta del modelo Vosk es necesaria para que `vosk_server.py` funcione correctamente en modo offline.
