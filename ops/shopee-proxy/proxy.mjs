// Repasse para a API da Shopee a partir de um IP fixo (exigido pela lista de IPs do Shopee Open Platform).
// Só aceita chamadas assinadas pelo EcomBalance (HMAC com PROXY_SECRET, válido por 5 minutos) e só
// encaminha para os hosts oficiais da Shopee. Não guarda nada: é só um túnel.
// Uso: PROXY_SECRET=... node proxy.mjs   (escuta em 127.0.0.1:8080; o Caddy cuida do HTTPS)
import http from 'node:http';
import crypto from 'node:crypto';

const SECRET = process.env.PROXY_SECRET;
if (!SECRET) { console.error('PROXY_SECRET ausente'); process.exit(1); }
const HOSTS = new Set(['partner.shopeemobile.com', 'partner.test-stable.shopeemobile.com', 'openplatform.sandbox.test-stable.shopee.sg']);

http.createServer(async (req, res) => {
  const fim = (code, msg) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: msg })); };
  try {
    if (req.url === '/saude') return fim(200, 'ok');
    const alvo = new URL(req.headers['x-alvo'] || '');
    if (alvo.protocol !== 'https:' || !HOSTS.has(alvo.hostname)) return fim(403, 'destino não permitido');
    let corpo = ''; for await (const c of req) corpo += c;
    const ts = Number(req.headers['x-ts'] || 0);
    if (!ts || Math.abs(Date.now() - ts) > 5 * 60_000) return fim(401, 'assinatura expirada');
    const esperado = crypto.createHmac('sha256', SECRET).update(`${ts}\n${req.method}\n${alvo.href}\n${corpo}`).digest('hex');
    const recebido = String(req.headers['x-assinatura'] || '');
    if (recebido.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(recebido), Buffer.from(esperado))) return fim(401, 'assinatura inválida');
    const r = await fetch(alvo, { method: req.method, headers: { 'content-type': req.headers['content-type'] || 'application/json' }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : corpo });
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/json' });
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) { fim(502, String(e.message || e)); }
}).listen(8080, '127.0.0.1', () => console.log('repasse Shopee ouvindo em 127.0.0.1:8080'));
