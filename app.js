// Variables de Estado Globales
let config = null;
let dbDevice = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let serialPort = null;
let serialReader = null;
let connectionType = null;
let connectionState = 'disconnected';

let sensorRaw = { x: 0, y: 0, z: 0, btnA: 0, btnB: 0 };
let calibrationOffset = { x: 0, y: 0, z: 0 };
let sensorAngles = { pitch: 0, roll: 0 };

let canvas = null;
let ctx = null;
let cursor = { x: 0, y: 0, targetX: 0, targetY: 0 };
let isDrawing = false;
let currentBrushColor = '#ff6eb4';
let currentBrushWidth = 10;
let drawStateActive = false;

let isEmotionsMode = false;
let currentBrushMode = 'normal';
let isSimulating = false;
let isRecording = false;
let recordedSequence = [];
let recordingStartTime = 0;
let savedPatterns = {};
let rollingWindow = [];
let lastRecognitionTime = 0;
let lastCalibrationTime = 0;

// ─── Módulo de Voz (Vosk WebSocket) ───
let voiceSocket = null;
let voiceAudioContext = null;
let voiceMediaStream = null;
let voiceScriptNode = null;
let voiceActive = false;

// ─── Filtro Parkinson ───
let parkinsonProfile = 'off'; // off, leve, moderado, severo, custom
const parkinsonPresets = {
  off:       { deadzone: 10,  smoothing: 0.12, freqCutoff: 15 },
  leve:      { deadzone: 30,  smoothing: 0.08, freqCutoff: 8 },
  moderado:  { deadzone: 80,  smoothing: 0.05, freqCutoff: 6 },
  severo:    { deadzone: 150, smoothing: 0.03, freqCutoff: 4 },
  custom:    { deadzone: 10,  smoothing: 0.12, freqCutoff: 12 },
};
let pkFilterHistory = { x: [], y: [] };
const PK_HISTORY_SIZE = 10;

// Elementos del DOM
const elStatus = document.getElementById('connection-status');
const elBtnConnect = document.getElementById('btn-connect');
const elBtnConnectUsb = document.getElementById('btn-connect-usb');
const elBtnDisconnect = document.getElementById('btn-disconnect');
const elBtnClear = document.getElementById('btn-clear');
const elBtnCalibrate = document.getElementById('btn-calibrate');
const elCheckSimulate = document.getElementById('check-simulate');
const elVirtualCursor = document.getElementById('virtual-cursor');
const elBrushIndicator = document.getElementById('brush-indicator');
const elCoordsIndicator = document.getElementById('coords-indicator');
const elSimIndicator = document.getElementById('simulation-indicator');
const elCanvasWelcome = document.getElementById('canvas-welcome');

const elBrushWidth = document.getElementById('slider-brush-width');
const elBrushWidthVal = document.getElementById('brush-width-value');
const elColorPalette = document.getElementById('color-palette');

const elRawX = document.getElementById('raw-x');
const elRawY = document.getElementById('raw-y');
const elRawZ = document.getElementById('raw-z');
const elValPitch = document.getElementById('val-pitch');
const elValRoll = document.getElementById('val-roll');
const elProgPitch = document.getElementById('progress-pitch');
const elProgRoll = document.getElementById('progress-roll');
const elBtnA = document.getElementById('indicator-btn-a');
const elBtnB = document.getElementById('indicator-btn-b');

const elSelectAction = document.getElementById('select-gesture-action');
const elBtnRecord = document.getElementById('btn-record');
const elCountdown = document.getElementById('recording-countdown');
const elGesturePreviewCanvas = document.getElementById('gesture-preview-canvas');
const elPatternsList = document.getElementById('patterns-list');
const elGestureLog = document.getElementById('gesture-log');

const elBtnSaveSettings = document.getElementById('btn-save-settings');
const elCheckEmotions = document.getElementById('check-emotions');
const elEmotionIndicator = document.getElementById('emotion-indicator');

async function init() {
  try {
    const response = await fetch('./config.json');
    config = await response.json();
    setupUIFromConfig();
    setupCanvas();
    loadPatternsFromStorage();
    setupEventListeners();
    requestAnimationFrame(updateLoop);
  } catch (error) {
    console.error('Error cargando config:', error);
  }
}

function setupUIFromConfig() {
  // Cargar metadatos
  document.getElementById('app-title').innerHTML = `${config.app.name} <span class="badge" id="app-badge">${config.app.badge}</span>`;
  document.getElementById('app-subtitle').textContent = config.app.subtitle;
  
  // Cargar créditos
  const creditsHTML = `
    <div class="credits-school">🏫 ${config.app.school}</div>
    <div class="credits-authors">
      ${config.app.authors.map(a => `<span>👧 ${a}</span>`).join('')}
    </div>
    <div class="credits-year">📅 ${config.app.year} - ${config.app.version}</div>
  `;
  document.getElementById('credits-content').innerHTML = creditsHTML;

  // Paleta de colores
  elColorPalette.innerHTML = '';
  config.ui.availableColors.forEach((color) => {
    const option = document.createElement('div');
    option.className = `color-option ${color === config.drawing.defaultColor ? 'active' : ''}`;
    option.style.backgroundColor = color;
    option.dataset.color = color;
    option.addEventListener('click', () => {
      document.querySelectorAll('.color-option').forEach(el => el.classList.remove('active'));
      option.classList.add('active');
      setBrushColor(color);
    });
    elColorPalette.appendChild(option);
  });

  currentBrushColor = config.drawing.defaultColor;
  currentBrushWidth = config.drawing.defaultWidth;
  elBrushWidth.value = currentBrushWidth;
  elBrushWidthVal.textContent = `${currentBrushWidth}px`;

  // Acciones de gestos
  elSelectAction.innerHTML = '';
  config.patterns.actionMappings.forEach(mapping => {
    const opt = document.createElement('option');
    opt.value = mapping.patternName;
    opt.textContent = mapping.label;
    elSelectAction.appendChild(opt);
  });

  // Configurar sliders con valores iniciales
  document.getElementById('slider-sens-x').value = config.drawing.sensitivityX;
  document.getElementById('val-sens-x').textContent = config.drawing.sensitivityX;
  document.getElementById('slider-sens-y').value = config.drawing.sensitivityY;
  document.getElementById('val-sens-y').textContent = config.drawing.sensitivityY;
  document.getElementById('slider-smoothing').value = config.drawing.smoothingFactor;
  document.getElementById('val-smoothing').textContent = config.drawing.smoothingFactor;
  document.getElementById('slider-deadzone').value = config.drawing.tiltThreshold;
  document.getElementById('val-deadzone').textContent = config.drawing.tiltThreshold;
  document.getElementById('slider-dtw-thresh').value = config.patterns.dtwThreshold;
  document.getElementById('val-dtw-thresh').textContent = config.patterns.dtwThreshold;
}

let resizeTimeout = null;

function setupCanvas() {
  canvas = document.getElementById('paint-canvas');
  ctx = canvas.getContext('2d');

  // Fijar tamaño inicial una sola vez
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = Math.round(rect.width);
  canvas.height = Math.round(rect.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Solo redimensionar en resize real de ventana, con debounce
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(resizeCanvas, 300);
  });

  cursor.x = canvas.width / 2;
  cursor.y = canvas.height / 2;
  cursor.targetX = cursor.x;
  cursor.targetY = cursor.y;
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const newW = Math.round(rect.width);
  const newH = Math.round(rect.height);

  // Solo redimensionar si el tamaño realmente cambio
  if (newW === canvas.width && newH === canvas.height) return;

  // Guardar dibujo actual
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  tempCtx.drawImage(canvas, 0, 0);

  // Aplicar nuevo tamaño
  canvas.width = newW;
  canvas.height = newH;

  // Restaurar dibujo y contexto
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.drawImage(tempCanvas, 0, 0);
}

// ... Funciones de bluetooth omitidas (misma lógica de app.js original) ...
async function connectBluetooth() {
  if (!navigator.bluetooth) { alert('Bluetooth no soportado en este navegador'); return; }
  setConnectionState('connecting');
  try {
    dbDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'BBC micro:bit' }],
      optionalServices: [config.bluetooth.serviceUuid]
    });
    dbDevice.addEventListener('gattserverdisconnected', onDisconnected);
    const server = await dbDevice.gatt.connect();
    const service = await server.getPrimaryService(config.bluetooth.serviceUuid);
    txCharacteristic = await service.getCharacteristic(config.bluetooth.txCharacteristicUuid);
    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleDataReceived);
    connectionType = 'ble';
    setConnectionState('connected');
    elCanvasWelcome.classList.add('hidden');
  } catch (error) {
    setConnectionState('disconnected');
  }
}

async function connectSerial() {
  if (!navigator.serial) { alert('Web Serial no soportado en este navegador'); return; }
  setConnectionState('connecting');
  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: config.serial.baudRate });
    connectionType = 'usb';
    setConnectionState('connected');
    elCanvasWelcome.classList.add('hidden');
    readSerialLoop();
  } catch (error) {
    setConnectionState('disconnected');
  }
}

async function readSerialLoop() {
  const decoder = new TextDecoder();
  const reader = serialPort.readable.getReader();
  serialReader = reader;
  let serialBuffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      serialBuffer += decoder.decode(value, { stream: true });
      let lineBreakIndex;
      while ((lineBreakIndex = serialBuffer.indexOf('\n')) !== -1) {
        const line = serialBuffer.substring(0, lineBreakIndex).trim();
        serialBuffer = serialBuffer.substring(lineBreakIndex + 1);
        if (line) parseSensorData(line);
      }
    }
  } catch (error) {} finally {
    reader.releaseLock();
  }
}

function onDisconnected() {
  connectionType = null;
  setConnectionState('disconnected');
}

async function disconnectDevice() {
  if (connectionType === 'ble' && dbDevice && dbDevice.gatt.connected) dbDevice.gatt.disconnect();
  else if (connectionType === 'usb') {
    if (serialReader) await serialReader.cancel();
    if (serialPort) await serialPort.close();
    onDisconnected();
  }
}

function setConnectionState(state) {
  connectionState = state;
  if (state === 'connected') {
    elStatus.className = 'status-indicator status-connected';
    elStatus.querySelector('.status-text').textContent = `Micro:bit Conectado`;
    elBtnConnect.classList.add('hidden');
    elBtnConnectUsb.classList.add('hidden');
    elBtnDisconnect.classList.remove('hidden');
  } else if (state === 'connecting') {
    elStatus.className = 'status-indicator status-connecting';
    elStatus.querySelector('.status-text').textContent = 'Conectando...';
  } else {
    elStatus.className = 'status-indicator status-disconnected';
    elStatus.querySelector('.status-text').textContent = 'Desconectado';
    elBtnConnect.classList.remove('hidden');
    elBtnConnectUsb.classList.remove('hidden');
    elBtnDisconnect.classList.add('hidden');
  }
}

const textDecoder = new TextDecoder();
let rxBuffer = '';
function handleDataReceived(event) {
  rxBuffer += textDecoder.decode(event.target.value);
  let lineBreakIndex;
  while ((lineBreakIndex = rxBuffer.indexOf('\n')) !== -1) {
    const line = rxBuffer.substring(0, lineBreakIndex).trim();
    rxBuffer = rxBuffer.substring(lineBreakIndex + 1);
    if (line) parseSensorData(line);
  }
}

function parseSensorData(line) {
  const parts = line.split(',');
  if (parts.length < 5) return;
  sensorRaw.x = parseInt(parts[0], 10);
  sensorRaw.y = parseInt(parts[1], 10);
  sensorRaw.z = parseInt(parts[2], 10);
  sensorRaw.btnA = parseInt(parts[3], 10);
  sensorRaw.btnB = parseInt(parts[4], 10);

  const calX = sensorRaw.x - calibrationOffset.x;
  const calY = sensorRaw.y - calibrationOffset.y;
  const calZ = sensorRaw.z - calibrationOffset.z;

  sensorAngles.pitch = Math.atan2(-calY, Math.sqrt(calX*calX + calZ*calZ)) * (180/Math.PI);
  sensorAngles.roll = Math.atan2(calX, calZ) * (180/Math.PI);

  updateTelemetryUI();
  updateCursorPosition(calX, calY);

  if (sensorRaw.btnA === 1) {
    if (!drawStateActive) { drawStateActive = true; isDrawing = true; }
  } else {
    if (drawStateActive) {
      drawStateActive = false;
      isDrawing = false;
      // Limpiar el buffer de gestos al soltar el pincel
      // para que los trazos de dibujo no se confundan con un gesto
      rollingWindow = [];
    }
  }

  // Debounce del boton B - solo calibrar una vez cada 1.5s
  if (sensorRaw.btnB === 1 && !isRecording) {
    const now = Date.now();
    if (now - lastCalibrationTime > 1500) {
      lastCalibrationTime = now;
      calibrateSensor();
    }
  }

  if (isRecording) recordSample(calX, calY);
  else if (!drawStateActive) {
    pushToRollingWindow(calX, calY);
    checkContinuousGestures();
  }
}

function calibrateSensor() {
  // Guardar la lectura actual del acelerometro como el punto cero
  calibrationOffset.x = sensorRaw.x;
  calibrationOffset.y = sensorRaw.y;
  calibrationOffset.z = sensorRaw.z - 1000;

  // Forzar el cursor al centro exacto del lienzo
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  cursor.x = centerX;
  cursor.y = centerY;
  cursor.targetX = centerX;
  cursor.targetY = centerY;

  // Feedback visual
  elBtnCalibrate.style.transform = 'scale(1.1)';
  setTimeout(() => elBtnCalibrate.style.transform = 'none', 300);
}

function updateCursorPosition(calX, calY) {
  if (isSimulating) return;

  // ─── Capa 1: Filtro de frecuencia (media móvil para rechazar oscilaciones rápidas) ───
  const pk = parkinsonPresets[parkinsonProfile] || parkinsonPresets.off;

  pkFilterHistory.x.push(calX);
  pkFilterHistory.y.push(calY);
  if (pkFilterHistory.x.length > PK_HISTORY_SIZE) pkFilterHistory.x.shift();
  if (pkFilterHistory.y.length > PK_HISTORY_SIZE) pkFilterHistory.y.shift();

  let filteredX = calX, filteredY = calY;
  if (parkinsonProfile !== 'off') {
    // Media móvil ponderada (más peso a muestras recientes)
    let sumX = 0, sumY = 0, weightSum = 0;
    const hist = pkFilterHistory.x.length;
    for (let i = 0; i < hist; i++) {
      const w = (i + 1); // peso creciente
      sumX += pkFilterHistory.x[i] * w;
      sumY += pkFilterHistory.y[i] * w;
      weightSum += w;
    }
    filteredX = sumX / weightSum;
    filteredY = sumY / weightSum;
  }

  // ─── Capa 2: Zona muerta expandida (deadzone del perfil Parkinson) ───
  const threshold = pk.deadzone;
  const sensX = config.drawing.sensitivityX;
  const sensY = config.drawing.sensitivityY;
  let vx = 0, vy = 0;
  if (Math.abs(filteredX) > threshold) vx = (filteredX > 0 ? (filteredX - threshold) : (filteredX + threshold)) * sensX * 0.015;
  if (Math.abs(filteredY) > threshold) vy = -(filteredY > 0 ? (filteredY - threshold) : (filteredY + threshold)) * sensY * 0.015;

  cursor.targetX += vx;
  cursor.targetY += vy;
  cursor.targetX = Math.max(0, Math.min(canvas.width, cursor.targetX));
  cursor.targetY = Math.max(0, Math.min(canvas.height, cursor.targetY));
}

function updateTelemetryUI() {
  elRawX.textContent = sensorRaw.x;
  elRawY.textContent = sensorRaw.y;
  elRawZ.textContent = sensorRaw.z;
  elValPitch.textContent = `${Math.round(sensorAngles.pitch)}°`;
  elValRoll.textContent = `${Math.round(sensorAngles.roll)}°`;
  elProgPitch.style.width = `${Math.max(0, Math.min(100, ((sensorAngles.pitch + 60) / 120) * 100))}%`;
  elProgRoll.style.width = `${Math.max(0, Math.min(100, ((sensorAngles.roll + 60) / 120) * 100))}%`;
  sensorRaw.btnA ? elBtnA.classList.add('active') : elBtnA.classList.remove('active');
  sensorRaw.btnB ? elBtnB.classList.add('active') : elBtnB.classList.remove('active');
}

function updateLoop() {
  // Capa 3 del filtro Parkinson: suavizado EMA adaptativo
  const pk = parkinsonPresets[parkinsonProfile] || parkinsonPresets.off;
  const factor = parkinsonProfile !== 'off' ? pk.smoothing : config.drawing.smoothingFactor;
  const lastX = cursor.x;
  const lastY = cursor.y;

  cursor.x += (cursor.targetX - cursor.x) * factor;
  cursor.y += (cursor.targetY - cursor.y) * factor;

  const dx = cursor.x - lastX;
  const dy = cursor.y - lastY;
  const speed = Math.sqrt(dx * dx + dy * dy);

  // Determinar color y grosor segun modo emociones o manual
  let drawColor = currentBrushColor;
  let drawWidth = currentBrushWidth;

  if (isEmotionsMode && isDrawing) {
    if (speed > 15) {
      drawColor = config.ui.availableColors[4];
      drawWidth = config.drawing.maxWidth;
      elEmotionIndicator.innerHTML = '\u{1F620} Energia Alta! (Grueso Rojo)';
      elEmotionIndicator.style.backgroundColor = '#fee2e2';
      elEmotionIndicator.style.color = '#ef4444';
      elEmotionIndicator.style.borderColor = '#ef4444';
    } else if (speed > 4) {
      drawColor = config.ui.availableColors[3];
      drawWidth = 15;
      elEmotionIndicator.innerHTML = '\u{1F604} Alegria! (Medio Amarillo)';
      elEmotionIndicator.style.backgroundColor = '#fef3c7';
      elEmotionIndicator.style.color = '#d97706';
      elEmotionIndicator.style.borderColor = '#d97706';
    } else {
      drawColor = config.ui.availableColors[5];
      drawWidth = 5;
      elEmotionIndicator.innerHTML = '\u{1F60C} Tranquilidad (Fino Azul)';
      elEmotionIndicator.style.backgroundColor = '#eff6ff';
      elEmotionIndicator.style.color = '#3b82f6';
      elEmotionIndicator.style.borderColor = '#3b82f6';
    }
  }

  if (isDrawing && speed > 0.1) {
    drawBrushStroke(lastX, lastY, cursor.x, cursor.y, drawColor, drawWidth, speed);
    elVirtualCursor.classList.add('drawing');
  } else {
    elVirtualCursor.classList.remove('drawing');
  }

  elVirtualCursor.style.left = `${cursor.x}px`;
  elVirtualCursor.style.top = `${cursor.y}px`;
  elCoordsIndicator.textContent = `X: ${Math.round(cursor.x)}, Y: ${Math.round(cursor.y)}`;
  requestAnimationFrame(updateLoop);
}

// Motor de pinceles artisticos
function drawBrushStroke(x1, y1, x2, y2, color, width, speed) {
  ctx.save();
  const mode = currentBrushMode;

  switch (mode) {
    case 'normal':
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;

    case 'neon':
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Segunda pasada mas fina y brillante
      ctx.lineWidth = width * 0.4;
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;

    case 'watercolor':
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = color;
      for (let i = 0; i < 6; i++) {
        const rx = x2 + (Math.random() - 0.5) * width * 2;
        const ry = y2 + (Math.random() - 0.5) * width * 2;
        const r = width * 0.6 + Math.random() * width * 0.8;
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'crayon':
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ox1 = x1 + (Math.random() - 0.5) * 3;
        const oy1 = y1 + (Math.random() - 0.5) * 3;
        const ox2 = x2 + (Math.random() - 0.5) * 3;
        const oy2 = y2 + (Math.random() - 0.5) * 3;
        ctx.lineWidth = width * (0.5 + Math.random() * 0.5);
        ctx.beginPath();
        ctx.moveTo(ox1, oy1);
        ctx.lineTo(ox2, oy2);
        ctx.stroke();
      }
      break;

    case 'spray':
      ctx.fillStyle = color;
      const density = Math.max(15, Math.round(width * 2));
      for (let i = 0; i < density; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * width * 1.5;
        const sx = x2 + Math.cos(angle) * radius;
        const sy = y2 + Math.sin(angle) * radius;
        const dotSize = Math.random() * 2 + 0.5;
        ctx.globalAlpha = Math.random() * 0.4 + 0.1;
        ctx.beginPath();
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'dots':
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur = 0;
      const dotR = width * 0.5;
      ctx.beginPath();
      ctx.arc(x2, y2, dotR, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'stars':
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      drawStar(ctx, x2, y2, 5, width * 0.8, width * 0.35);
      break;

    case 'mirror':
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 0;
      // Trazo original
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // Trazo espejo horizontal
      const mirrorX1 = canvas.width - x1;
      const mirrorX2 = canvas.width - x2;
      ctx.beginPath();
      ctx.moveTo(mirrorX1, y1);
      ctx.lineTo(mirrorX2, y2);
      ctx.stroke();
      break;

    default:
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
  }

  ctx.restore();
}

function drawStar(context, cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  context.beginPath();
  context.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    context.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    context.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  context.lineTo(cx, cy - outerR);
  context.closePath();
  context.fill();
}

function setBrushColor(c) { currentBrushColor = c; }
function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

function setupMouseSimulation() {
  const wrapper = document.querySelector('.canvas-wrapper');
  wrapper.addEventListener('mousemove', (e) => {
    if (!isSimulating) return;
    const rect = wrapper.getBoundingClientRect();
    cursor.targetX = e.clientX - rect.left;
    cursor.targetY = e.clientY - rect.top;
  });
  wrapper.addEventListener('mousedown', () => {
    if (!isSimulating) return;
    isDrawing = true; sensorRaw.btnA = 1; updateTelemetryUI();
  });
  wrapper.addEventListener('mouseup', () => {
    if (!isSimulating) return;
    isDrawing = false; sensorRaw.btnA = 0; updateTelemetryUI();
  });
}

function startRecordingGesture() {
  if (isRecording) return;
  const gestureName = elSelectAction.value;
  isRecording = true; recordedSequence = [];
  elBtnRecord.className = 'btn btn-record-active';
  elBtnRecord.innerHTML = '<i class="fa-solid fa-square"></i> Grabando...';
  elCountdown.classList.remove('hidden');
  let timeLeft = config.patterns.recordingDurationMs;
  elCountdown.textContent = `${(timeLeft/1000).toFixed(1)}s`;
  const t = setInterval(() => {
    timeLeft -= 100;
    if (timeLeft <= 0) clearInterval(t);
    else elCountdown.textContent = `${(timeLeft/1000).toFixed(1)}s`;
  }, 100);
  setTimeout(() => { clearInterval(t); stopRecordingGesture(gestureName); }, config.patterns.recordingDurationMs);
}

function recordSample(calX, calY) {
  recordedSequence.push([calX, calY]);
  drawGesturePreview(recordedSequence);
}

function stopRecordingGesture(name) {
  isRecording = false;
  elBtnRecord.className = 'btn btn-record-ready';
  elBtnRecord.innerHTML = '<i class="fa-solid fa-circle"></i> Grabar';
  elCountdown.classList.add('hidden');
  if (recordedSequence.length > 10) {
    savedPatterns[name] = normalizeSequence(recordedSequence);
    savePatternsToStorage();
    updatePatternsUI();
  }
}

function normalizeSequence(seq) {
  if (seq.length === 0) return [];
  let sumX = 0, sumY = 0;
  for (const pt of seq) { sumX += pt[0]; sumY += pt[1]; }
  const cx = sumX / seq.length, cy = sumY / seq.length;
  const centered = seq.map(pt => [pt[0] - cx, pt[1] - cy]);
  let maxDist = 0.0001;
  for (const pt of centered) {
    const dist = Math.sqrt(pt[0]*pt[0] + pt[1]*pt[1]);
    if (dist > maxDist) maxDist = dist;
  }
  return centered.map(pt => [pt[0]/maxDist, pt[1]/maxDist]);
}

function drawGesturePreview(sequence) {
  const gCtx = elGesturePreviewCanvas.getContext('2d');
  gCtx.clearRect(0, 0, elGesturePreviewCanvas.width, elGesturePreviewCanvas.height);
  if (sequence.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  sequence.forEach(p => {
    if(p[0]<minX) minX=p[0]; if(p[0]>maxX) maxX=p[0];
    if(p[1]<minY) minY=p[1]; if(p[1]>maxY) maxY=p[1];
  });
  const dx = maxX - minX || 1, dy = maxY - minY || 1;
  gCtx.beginPath(); gCtx.strokeStyle = '#a78bfa'; gCtx.lineWidth = 4;
  sequence.forEach((p, i) => {
    const x = 10 + ((p[0]-minX)/dx) * (elGesturePreviewCanvas.width-20);
    const y = 10 + (1 - ((p[1]-minY)/dy)) * (elGesturePreviewCanvas.height-20);
    if(i===0) gCtx.moveTo(x, y); else gCtx.lineTo(x, y);
  });
  gCtx.stroke();
}

function pushToRollingWindow(calX, calY) {
  rollingWindow.push([calX, calY]);
  if (rollingWindow.length > 50) rollingWindow.shift();
}

function checkContinuousGestures() {
  const now = Date.now();
  if (now - lastRecognitionTime < 2000) return;
  if (rollingWindow.length < 20) return;
  const normalizedBuffer = normalizeSequence(rollingWindow);
  let bestMatch = null, minDistance = Infinity;
  Object.keys(savedPatterns).forEach(name => {
    const dist = computeDTWDistance(normalizedBuffer, savedPatterns[name]);
    if (dist < minDistance) { minDistance = dist; bestMatch = name; }
  });
  if (bestMatch && minDistance < config.patterns.dtwThreshold) {
    triggerGestureAction(bestMatch, minDistance);
    lastRecognitionTime = now;
    rollingWindow = [];
  }
}

function computeDTWDistance(seq1, seq2) {
  const n = seq1.length, m = seq2.length;
  if(n===0 || m===0) return Infinity;
  const dtw = Array(n+1).fill(null).map(()=>Array(m+1).fill(Infinity));
  dtw[0][0] = 0;
  for(let i=1; i<=n; i++) {
    for(let j=1; j<=m; j++) {
      const dx = seq1[i-1][0]-seq2[j-1][0], dy = seq1[i-1][1]-seq2[j-1][1];
      const cost = Math.sqrt(dx*dx + dy*dy);
      dtw[i][j] = cost + Math.min(dtw[i-1][j], dtw[i][j-1], dtw[i-1][j-1]);
    }
  }
  return dtw[n][m] / (n+m);
}

function triggerGestureAction(name, score) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = `<span class="log-msg">✨ ${name.toUpperCase()}</span>`;
  elGestureLog.prepend(entry);
  if (name === 'clear') clearCanvas();
  else if (name === 'color') cycleBrushColor();
  else if (name === 'brush_size') cycleBrushSize();
}

function cycleBrushColor() {
  const colors = config.ui.availableColors;
  const idx = (colors.indexOf(currentBrushColor) + 1) % colors.length;
  setBrushColor(colors[idx]);
  document.querySelectorAll('.color-option').forEach(el => {
    el.dataset.color === colors[idx] ? el.classList.add('active') : el.classList.remove('active');
  });
}

function cycleBrushSize() {
  currentBrushWidth = currentBrushWidth > 40 ? 5 : currentBrushWidth + 10;
  elBrushWidth.value = currentBrushWidth;
  elBrushWidthVal.textContent = `${currentBrushWidth}px`;
}

function savePatternsToStorage() { localStorage.setItem('airpaint_gestures', JSON.stringify(savedPatterns)); }
function loadPatternsFromStorage() {
  try { savedPatterns = JSON.parse(localStorage.getItem('airpaint_gestures')) || {}; updatePatternsUI(); } catch(e){}
}

function updatePatternsUI() {
  elPatternsList.innerHTML = '';
  const keys = Object.keys(savedPatterns);
  if (keys.length === 0) {
    elPatternsList.innerHTML = '<div class="no-patterns">¡Aún no hay gestos! 😊</div>';
    return;
  }
  keys.forEach(key => {
    const label = config.patterns.actionMappings.find(m => m.patternName === key)?.label || key;
    const item = document.createElement('div');
    item.className = 'pattern-item';
    item.innerHTML = `<span>${label}</span><button class="btn-delete-pattern" data-key="${key}">❌</button>`;
    item.querySelector('button').addEventListener('click', () => {
      delete savedPatterns[key]; savePatternsToStorage(); updatePatternsUI();
    });
    elPatternsList.appendChild(item);
  });
}

function setupEventListeners() {
  elBtnConnect.addEventListener('click', connectBluetooth);
  elBtnConnectUsb.addEventListener('click', connectSerial);
  elBtnDisconnect.addEventListener('click', disconnectDevice);
  elBtnClear.addEventListener('click', clearCanvas);
  elBtnCalibrate.addEventListener('click', calibrateSensor);
  
  elCheckSimulate.addEventListener('change', (e) => {
    isSimulating = e.target.checked;
    isSimulating ? elSimIndicator.classList.remove('hidden') : elSimIndicator.classList.add('hidden');
    if (isSimulating) elCanvasWelcome.classList.add('hidden');
  });

  elCheckEmotions.addEventListener('change', (e) => {
    isEmotionsMode = e.target.checked;
    if (!isEmotionsMode) {
      elEmotionIndicator.innerHTML = '😴 Modo Manual';
      elEmotionIndicator.style.backgroundColor = '#f1f5f9';
      elEmotionIndicator.style.color = 'var(--color-text-muted)';
      elEmotionIndicator.style.borderColor = 'var(--border-color)';
    }
  });

  elBrushWidth.addEventListener('input', (e) => {
    currentBrushWidth = parseInt(e.target.value, 10);
    elBrushWidthVal.textContent = `${currentBrushWidth}px`;
  });

  document.getElementById('select-brush-mode').addEventListener('change', (e) => {
    currentBrushMode = e.target.value;
  });

  elBtnRecord.addEventListener('click', startRecordingGesture);
  
  // Handlers para sliders de calibración (corregidos y guardan en config)
  const binds = [
    ['slider-sens-x', 'val-sens-x', 'sensitivityX', 'drawing'],
    ['slider-sens-y', 'val-sens-y', 'sensitivityY', 'drawing'],
    ['slider-smoothing', 'val-smoothing', 'smoothingFactor', 'drawing'],
    ['slider-deadzone', 'val-deadzone', 'tiltThreshold', 'drawing'],
    ['slider-dtw-thresh', 'val-dtw-thresh', 'dtwThreshold', 'patterns']
  ];

  binds.forEach(([sliderId, valId, confKey, confSec]) => {
    document.getElementById(sliderId).addEventListener('input', (e) => {
      document.getElementById(valId).textContent = e.target.value;
      config[confSec][confKey] = parseFloat(e.target.value);
    });
  });

  elBtnSaveSettings.addEventListener('click', () => {
    elBtnSaveSettings.innerHTML = '<i class="fa-solid fa-check"></i> ¡Guardado!';
    setTimeout(() => elBtnSaveSettings.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 💾 Guardar Ajustes', 2000);
  });

  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    document.querySelector('.sidebar-wrapper').classList.toggle('collapsed');
  });

  document.getElementById('btn-open-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
  document.querySelectorAll('.modal-close-btn, #btn-close-help-confirm').forEach(b => 
    b.addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'))
  );

  // Tabs del modal corregidos
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-content'));
      e.target.classList.add('active');
      document.getElementById(e.target.dataset.tab).classList.add('active-content');
    });
  });

  // ─── Voz: Toggle micrófono ───
  document.getElementById('check-voice').addEventListener('change', (e) => {
    if (e.target.checked) startVoiceRecognition();
    else stopVoiceRecognition();
  });

  // ─── Parkinson: Selector de perfil ───
  document.getElementById('select-parkinson-profile').addEventListener('change', (e) => {
    applyParkinsonProfile(e.target.value);
  });

  // ─── Parkinson: Sliders personalizados ───
  const pkBinds = [
    ['slider-pk-deadzone', 'val-pk-deadzone', 'deadzone'],
    ['slider-pk-smoothing', 'val-pk-smoothing', 'smoothing'],
    ['slider-pk-freq', 'val-pk-freq', 'freqCutoff'],
  ];
  pkBinds.forEach(([sliderId, valId, key]) => {
    document.getElementById(sliderId).addEventListener('input', (e) => {
      document.getElementById(valId).textContent = e.target.value;
      parkinsonPresets.custom[key] = parseFloat(e.target.value);
    });
  });

  setupMouseSimulation();
  elGesturePreviewCanvas.width = 300;
  elGesturePreviewCanvas.height = 100;
}

// ═══════════════════════════════════════════════════════
//  MÓDULO DE VOZ — WebSocket a Vosk Server
// ═══════════════════════════════════════════════════════

async function startVoiceRecognition() {
  const elStatus = document.getElementById('voice-status');
  const elIcon = elStatus.querySelector('.voice-status-icon');
  const elText = elStatus.querySelector('.voice-status-text');

  try {
    // Conectar WebSocket al servidor Vosk
    voiceSocket = new WebSocket('ws://localhost:2700');

    voiceSocket.onopen = async () => {
      elStatus.className = 'voice-status-box connected';
      elIcon.textContent = '🟢';
      elText.textContent = 'Conectado al servidor de voz';

      // Capturar micrófono
      try {
        voiceMediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1, sampleRate: 16000 }
        });

        voiceAudioContext = new AudioContext({ sampleRate: 16000 });
        const source = voiceAudioContext.createMediaStreamSource(voiceMediaStream);
        voiceScriptNode = voiceAudioContext.createScriptProcessor(4096, 1, 1);

        voiceScriptNode.onaudioprocess = (event) => {
          if (voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
            const float32 = event.inputBuffer.getChannelData(0);
            // Convertir Float32 a Int16 PCM
            const int16 = new Int16Array(float32.length);
            for (let i = 0; i < float32.length; i++) {
              int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)));
            }
            voiceSocket.send(int16.buffer);
          }
        };

        source.connect(voiceScriptNode);
        voiceScriptNode.connect(voiceAudioContext.destination);

        voiceActive = true;
        elStatus.className = 'voice-status-box listening';
        elIcon.textContent = '🎤';
        elText.textContent = 'Escuchando...';
      } catch (micErr) {
        elStatus.className = 'voice-status-box error';
        elIcon.textContent = '❌';
        elText.textContent = 'Error de micrófono';
        console.error('Mic error:', micErr);
      }
    };

    voiceSocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'partial') {
        document.getElementById('voice-partial').textContent = `🗣️ "${data.text}"`;
      } else if (data.type === 'result') {
        document.getElementById('voice-partial').textContent = '';
        if (data.matched) {
          executeVoiceCommand(data.action, data.display, data.text);
          addVoiceLogEntry(data.display, data.text);
        }
      }
    };

    voiceSocket.onerror = () => {
      elStatus.className = 'voice-status-box error';
      elIcon.textContent = '❌';
      elText.textContent = 'Error: ¿Servidor Vosk activo?';
    };

    voiceSocket.onclose = () => {
      if (voiceActive) {
        elStatus.className = 'voice-status-box error';
        elIcon.textContent = '📴';
        elText.textContent = 'Desconectado del servidor';
      }
    };

  } catch (err) {
    console.error('Voice init error:', err);
  }
}

function stopVoiceRecognition() {
  voiceActive = false;

  if (voiceScriptNode) { voiceScriptNode.disconnect(); voiceScriptNode = null; }
  if (voiceAudioContext) { voiceAudioContext.close(); voiceAudioContext = null; }
  if (voiceMediaStream) { voiceMediaStream.getTracks().forEach(t => t.stop()); voiceMediaStream = null; }
  if (voiceSocket) { voiceSocket.close(); voiceSocket = null; }

  const elStatus = document.getElementById('voice-status');
  elStatus.className = 'voice-status-box';
  elStatus.querySelector('.voice-status-icon').textContent = '🔇';
  elStatus.querySelector('.voice-status-text').textContent = 'Micrófono apagado';
  document.getElementById('voice-partial').textContent = '';
}

function addVoiceLogEntry(display, rawText) {
  const log = document.getElementById('voice-log');
  const placeholder = log.querySelector('.log-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'voice-log-entry';
  entry.innerHTML = `<span class="voice-cmd-display">${display}</span><span class="voice-cmd-text">"${rawText}"</span>`;
  log.prepend(entry);

  // Mantener máximo 10 entradas
  while (log.children.length > 10) log.removeChild(log.lastChild);
}

function executeVoiceCommand(action, display, text) {
  // ─── Colores ───
  const colorMap = {
    color_rojo: '#f87171', color_rosa: '#ff6eb4', color_morado: '#a78bfa',
    color_verde: '#34d399', color_amarillo: '#fbbf24', color_azul: '#60a5fa',
    color_naranja: '#fb923c', color_blanco: '#ffffff', color_negro: '#1e293b',
  };
  if (colorMap[action]) {
    setBrushColor(colorMap[action]);
    document.querySelectorAll('.color-option').forEach(el => {
      el.dataset.color === colorMap[action] ? el.classList.add('active') : el.classList.remove('active');
    });
    return;
  }

  // ─── Pinceles ───
  const brushMap = {
    pincel_normal: 'normal', pincel_neon: 'neon', pincel_acuarela: 'watercolor',
    pincel_crayon: 'crayon', pincel_spray: 'spray', pincel_puntos: 'dots',
    pincel_estrellas: 'stars', pincel_espejo: 'mirror',
  };
  if (brushMap[action]) {
    currentBrushMode = brushMap[action];
    document.getElementById('select-brush-mode').value = brushMap[action];
    return;
  }

  // ─── Funciones ───
  switch (action) {
    case 'limpiar': clearCanvas(); break;
    case 'calibrar': calibrateSensor(); break;
    case 'grosor_mas':
      currentBrushWidth = Math.min(50, currentBrushWidth + 5);
      elBrushWidth.value = currentBrushWidth;
      elBrushWidthVal.textContent = `${currentBrushWidth}px`;
      break;
    case 'grosor_menos':
      currentBrushWidth = Math.max(1, currentBrushWidth - 5);
      elBrushWidth.value = currentBrushWidth;
      elBrushWidthVal.textContent = `${currentBrushWidth}px`;
      break;
    case 'emociones_on':
      isEmotionsMode = true;
      document.getElementById('check-emotions').checked = true;
      break;
    case 'emociones_off':
      isEmotionsMode = false;
      document.getElementById('check-emotions').checked = false;
      elEmotionIndicator.innerHTML = '😴 Modo Manual';
      break;
    case 'guardar': saveCanvasAsImage(); break;
    case 'pintar_on':
      isDrawing = true;
      break;
    case 'pintar_off':
      isDrawing = false;
      rollingWindow = []; // Limpiar gestos para no lanzar falso positivo
      break;
  }

  // ─── Perfiles Parkinson ───
  const profileMap = {
    perfil_leve: 'leve', perfil_moderado: 'moderado',
    perfil_severo: 'severo', perfil_desactivar: 'off',
  };
  if (profileMap[action] !== undefined) {
    applyParkinsonProfile(profileMap[action]);
    document.getElementById('select-parkinson-profile').value = profileMap[action];
  }
}

// ═══════════════════════════════════════════════════════
//  PERFIL PARKINSON — Gestión de filtros de temblor
// ═══════════════════════════════════════════════════════

function applyParkinsonProfile(profile) {
  parkinsonProfile = profile;
  pkFilterHistory = { x: [], y: [] }; // Reset history

  const indicator = document.getElementById('parkinson-indicator');
  const customCtrl = document.getElementById('parkinson-custom-controls');

  indicator.className = 'parkinson-status-box';

  switch (profile) {
    case 'off':
      indicator.textContent = '⚪ Sin filtro activo';
      customCtrl.classList.add('hidden');
      break;
    case 'leve':
      indicator.textContent = '🟢 Filtro Leve — Deadzone: 30mg, Suavizado: 0.08';
      indicator.classList.add('active-leve');
      customCtrl.classList.add('hidden');
      break;
    case 'moderado':
      indicator.textContent = '🟡 Filtro Moderado — Deadzone: 80mg, Suavizado: 0.05';
      indicator.classList.add('active-moderado');
      customCtrl.classList.add('hidden');
      break;
    case 'severo':
      indicator.textContent = '🔴 Filtro Severo — Deadzone: 150mg, Suavizado: 0.03';
      indicator.classList.add('active-severo');
      customCtrl.classList.add('hidden');
      break;
    case 'custom':
      indicator.textContent = '🔧 Personalizado';
      customCtrl.classList.remove('hidden');
      // Sincronizar sliders
      document.getElementById('slider-pk-deadzone').value = parkinsonPresets.custom.deadzone;
      document.getElementById('val-pk-deadzone').textContent = parkinsonPresets.custom.deadzone;
      document.getElementById('slider-pk-smoothing').value = parkinsonPresets.custom.smoothing;
      document.getElementById('val-pk-smoothing').textContent = parkinsonPresets.custom.smoothing;
      document.getElementById('slider-pk-freq').value = parkinsonPresets.custom.freqCutoff;
      document.getElementById('val-pk-freq').textContent = parkinsonPresets.custom.freqCutoff;
      break;
  }
}

function saveCanvasAsImage() {
  const link = document.createElement('a');
  link.download = `airpaint_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

window.addEventListener('DOMContentLoaded', init);
