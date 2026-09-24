import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat, readFile, realpath } from 'node:fs/promises';

// Servidor de desenvolvimento local. Não substitui uma hospedagem com autenticação.
const root = await realpath(fileURLToPath(new URL('./dist/', import.meta.url)));
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('PORT inválida');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
 '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
 '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8',
 '.pdf':'application/pdf', '.png':'image/png', '.jpg':'image/jpeg', '.wasm':'application/wasm' };
const inside = file => { const relative = path.relative(root, file); return !relative.startsWith('..') && !path.isAbsolute(relative); };
const server = http.createServer(async (req, res) => {
 const reply = (status, message) => { res.writeHead(status, { 'Content-Type':'text/plain; charset=utf-8' }); res.end(message); };
 if (!['GET', 'HEAD'].includes(req.method)) return reply(405, 'Método não permitido');
 try {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.resolve(root, '.' + pathname);
  if (!inside(file)) return reply(403, 'Acesso negado');
  if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  file = await realpath(file);
  if (!inside(file) || !(await stat(file)).isFile()) return reply(403, 'Acesso negado');
  const bytes = await readFile(file);
  res.writeHead(200, { 'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream',
   'Content-Length':bytes.length, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : bytes);
 } catch (error) { reply(error instanceof URIError ? 400 : 404, 'Arquivo não encontrado ou caminho inválido'); }
});
server.on('error', error => { console.error('Não foi possível iniciar:', error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`CONCIL-IA: http://127.0.0.1:${port}`));
