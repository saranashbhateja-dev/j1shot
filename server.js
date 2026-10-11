// Local-first static server for Jee OneShot OS.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3001);
const DIR = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  try {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Method Not Allowed');
    }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (url.pathname === '/health') {
      const body = JSON.stringify({ok:true, app:'Jee OneShot OS', port:PORT});
      res.writeHead(200, {'Content-Type':'application/json', 'Cache-Control':'no-store'});
      return res.end(req.method === 'HEAD' ? '' : body);
    }
    const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(DIR, pathname.replace(/^\/+/, ''));
    if (file !== DIR && !file.startsWith(DIR + path.sep)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
      return res.end('Not found');
    }
    const ext = path.extname(file).toLowerCase();
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'Content-Length': body.length
    });
    return res.end(req.method === 'HEAD' ? '' : body);
  } catch (error) {
    res.writeHead(500, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('Server error');
  }
});
server.on('error', error => {
  if (error.code === 'EADDRINUSE') console.error(`Port ${PORT} is busy. Close the other app using it or set PORT to another value.`);
  else console.error(error);
});
server.listen(PORT, '127.0.0.1', () => console.log(`Jee OneShot OS running at http://127.0.0.1:${PORT}`));
