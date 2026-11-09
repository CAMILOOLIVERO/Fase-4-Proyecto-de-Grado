const crypto = require('crypto'); const cfg = require('./config');
const hash = (clave) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(clave, s, 64).toString('hex'); };
const verificar = (clave, h) => { const [s, k] = h.split(':'); const a = Buffer.from(k, 'hex'); const b = crypto.scryptSync(clave, s, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const firmar = (p) => { const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 7 * 864e5 })).toString('base64url'); return body + '.' + crypto.createHmac('sha256', cfg.secreto).update(body).digest('base64url'); };
const leer = (t) => { try { const [b, f] = t.split('.'); const ok = crypto.createHmac('sha256', cfg.secreto).update(b).digest('base64url'); if (f !== ok) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); return p.exp > Date.now() ? p : null; } catch { return null; } };
const requiere = (rol) => (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', ''); const p = t && leer(t);
  if (!p) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  if (rol && p.rol !== rol) return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
  req.usuario = p; next();
};
module.exports = { hash, verificar, firmar, leer, requiere };
