const crypto = require('crypto'); const cfg = require('./config');
const hash = (clave) => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(clave, s, 64).toString('hex'); };
const verificar = (clave, h) => { const [s, k] = h.split(':'); const a = Buffer.from(k, 'hex'); const b = crypto.scryptSync(clave, s, 64); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const firmar = (p) => { const body = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + 7 * 864e5 })).toString('base64url'); return body + '.' + crypto.createHmac('sha256', cfg.secreto).update(body).digest('base64url'); };
const leer = (t) => { try { const [b, f] = t.split('.'); const ok = crypto.createHmac('sha256', cfg.secreto).update(b).digest('base64url'); if (f !== ok) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); return p.exp > Date.now() ? p : null; } catch { return null; } };
const requiere = (rol) => async (req, res, next) => {
  const t = (req.headers.authorization || '').replace('Bearer ', ''); const p = t && leer(t);
  if (!p) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  try {
    // el rol y la existencia de la cuenta se verifican en la base de datos: una cuenta eliminada pierde el acceso de inmediato
    const { rows } = await require('./db').query('SELECT id, rol FROM usuario WHERE id=$1', [p.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Tu cuenta ya no existe. Inicia sesión de nuevo.' });
    if (rol && rows[0].rol !== rol) return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    req.usuario = { ...p, rol: rows[0].rol }; next();
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno del servidor.' }); }
};
module.exports = { hash, verificar, firmar, leer, requiere };
