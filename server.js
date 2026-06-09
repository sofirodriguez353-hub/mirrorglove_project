const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml'
};

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // Normalizar la URL de solicitud
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Quitar parámetros de búsqueda o hashes (?foo=bar)
  filePath = filePath.split('?')[0];

  // Resolver la ruta del archivo física
  const absolutePath = path.join(__dirname, filePath);

  // Validar que el archivo esté dentro del directorio del proyecto (seguridad básica)
  if (!absolutePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Acceso denegado (Fuera de límites)');
    return;
  }

  // Leer y servir el archivo
  fs.readFile(absolutePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('Archivo no encontrado (404)');
      } else {
        res.statusCode = 500;
        res.end(`Error interno del servidor: ${err.code}`);
      }
      return;
    }

    // Obtener tipo MIME basado en la extensión
    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(` MirrorGlove Local Server running successfully!`);
  console.log(` URL segura para Web Bluetooth: http://localhost:${PORT}`);
  console.log(' Presione Ctrl+C para detener el servidor.');
  console.log('==================================================');
});
