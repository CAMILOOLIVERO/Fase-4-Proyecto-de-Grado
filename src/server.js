const express = require('express'); const path = require('path'); const multer = require('multer');
const crypto = require('crypto'); const fs = require('fs');
const pool = require('./db'); const cfg = require('./config'); const auth = require('./auth');
const { alertarCercanos, alertarUsuario } = require('./notificaciones');

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '../public')));
const dirUp = path.join(__dirname, '../uploads'); fs.mkdirSync(dirUp, { recursive: true });
app.use('/uploads', express.static(dirUp));
const upload = multer({
  storage: multer.memoryStorage(), // la fotografía se guarda en la base de datos (funciona en servidores con disco temporal)
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_, f, cb) => cb(null, /^image\/(jpeg|png|webp)$/.test(f.mimetype)),
});
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Error interno del servidor.' }); });
const latlngOk = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

app.get('/api/salud', wrap(async (_, res) => { await pool.query('SELECT 1'); res.json({ ok: true, radio_m: cfg.radioAlertaM }); }));

// RF1 – registro con aceptación de tratamiento de datos
app.post('/api/registro', wrap(async (req, res) => {
  const { nombre, correo, clave, acepta_datos } = req.body || {};
  if (!nombre || !/^\S+@\S+\.\S+$/.test(correo || '') || (clave || '').length < 8) return res.status(400).json({ error: 'Nombre, correo válido y clave de mínimo 8 caracteres son obligatorios.' });
  if (acepta_datos !== true) return res.status(400).json({ error: 'Debes autorizar el tratamiento de tus datos personales.' });
  try {
    const { rows } = await pool.query(`INSERT INTO usuario (nombre,correo,clave_hash,acepta_datos) VALUES ($1,$2,$3,TRUE) RETURNING id,nombre,rol`, [nombre.trim().slice(0, 80), correo.toLowerCase(), auth.hash(clave)]);
    res.status(201).json({ token: auth.firmar({ id: rows[0].id, rol: rows[0].rol }), usuario: rows[0] });
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: 'Ese correo ya está registrado.' }); throw e; }
}));
app.post('/api/login', wrap(async (req, res) => {
  const { correo, clave } = req.body || {};
  const { rows } = await pool.query('SELECT id,nombre,rol,clave_hash FROM usuario WHERE correo=$1', [(correo || '').toLowerCase()]);
  if (!rows[0] || !auth.verificar(clave || '', rows[0].clave_hash)) return res.status(401).json({ error: 'Correo o clave incorrectos.' });
  res.json({ token: auth.firmar({ id: rows[0].id, rol: rows[0].rol }), usuario: { id: rows[0].id, nombre: rows[0].nombre, rol: rows[0].rol } });
}));

// Ubicación autorizada del usuario (base de las alertas por proximidad)
app.post('/api/ubicacion', auth.requiere(), wrap(async (req, res) => {
  const lat = +req.body.lat, lng = +req.body.lng;
  if (!latlngOk(lat, lng)) return res.status(400).json({ error: 'Ubicación inválida.' });
  await pool.query(`UPDATE usuario SET ubicacion=ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, ubicacion_en=now() WHERE id=$3`, [lat, lng, req.usuario.id]);
  const nuevas = await alertarUsuario(req.usuario.id);
  res.json({ ok: true, alertas_nuevas: nuevas });
}));

// RF2 – registrar reporte
app.post('/api/reportes', auth.requiere(), upload.single('foto'), wrap(async (req, res) => {
  const lat = +req.body.lat, lng = +req.body.lng, nivel = req.body.nivel;
  if (!latlngOk(lat, lng) || !['bajo', 'medio', 'alto'].includes(nivel)) return res.status(400).json({ error: 'Ubicación y nivel (bajo, medio o alto) son obligatorios.' });
  const desc = (req.body.descripcion || '').slice(0, 280) || null;
  const { rows } = await pool.query(`
    INSERT INTO reporte (usuario_id, ubicacion, nivel, descripcion, foto, zona_id)
    VALUES ($1, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography, $4, $5, $6,
      (SELECT z.id FROM zona_riesgo z WHERE ST_Covers(z.area, ST_SetSRID(ST_MakePoint($3,$2),4326)::geography) LIMIT 1))
    RETURNING id, nivel, estado, creado_en, zona_id`, [req.usuario.id, lat, lng, nivel, desc, null]);
  if (req.file) {
    await pool.query('INSERT INTO foto_reporte (reporte_id, tipo, datos) VALUES ($1,$2,$3)', [rows[0].id, req.file.mimetype, req.file.buffer]);
    await pool.query('UPDATE reporte SET foto=$2 WHERE id=$1', [rows[0].id, '/api/fotos/' + rows[0].id]);
  }
  const alertas = await alertarCercanos(rows[0]);
  res.status(201).json({ reporte: rows[0], alertas_enviadas: alertas });
}));

// Fotografía de un reporte (almacenada en la base de datos)
app.get('/api/fotos/:id', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT tipo, datos FROM foto_reporte WHERE reporte_id=$1', [+req.params.id || 0]);
  if (!rows[0]) return res.status(404).json({ error: 'Fotografía no encontrada.' });
  res.set({ 'Content-Type': rows[0].tipo, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=3600' }).send(rows[0].datos);
}));

// RF3 – mapa de reportes activos (GeoJSON)
app.get('/api/reportes', wrap(async (_, res) => {
  const { rows } = await pool.query(`
    SELECT r.id, r.nivel, r.estado, r.descripcion, r.foto, r.creado_en, z.nombre zona,
           (SELECT count(*)::int FROM confirmacion c WHERE c.reporte_id=r.id) confirmaciones,
           ST_Y(r.ubicacion::geometry) lat, ST_X(r.ubicacion::geometry) lng
    FROM reporte r LEFT JOIN zona_riesgo z ON z.id=r.zona_id
    WHERE r.estado IN ('sin_confirmar','confirmado') AND r.creado_en > now() - make_interval(hours => $1)
    ORDER BY r.creado_en DESC`, [cfg.vigenciaReporteH]);
  res.json({ type: 'FeatureCollection', features: rows.map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] }, properties: { id: r.id, nivel: r.nivel, estado: r.estado, descripcion: r.descripcion, foto: r.foto, creado_en: r.creado_en, zona: r.zona, confirmaciones: r.confirmaciones } })) });
}));
app.get('/api/zonas', wrap(async (_, res) => {
  const { rows } = await pool.query('SELECT id, nombre, ST_AsGeoJSON(area::geometry)::json geom FROM zona_riesgo ORDER BY id');
  res.json({ type: 'FeatureCollection', features: rows.map(z => ({ type: 'Feature', geometry: z.geom, properties: { id: z.id, nombre: z.nombre } })) });
}));

// Confirmación entre ciudadanos (mitiga reportes falsos)
app.post('/api/reportes/:id/confirmar', auth.requiere(), wrap(async (req, res) => {
  const id = +req.params.id;
  const r = await pool.query('SELECT usuario_id, estado FROM reporte WHERE id=$1', [id]);
  if (!r.rows[0]) return res.status(404).json({ error: 'Reporte no encontrado.' });
  if (r.rows[0].usuario_id === req.usuario.id) return res.status(400).json({ error: 'No puedes confirmar tu propio reporte.' });
  if (!['sin_confirmar', 'confirmado'].includes(r.rows[0].estado)) return res.status(400).json({ error: 'El reporte ya no está activo.' });
  await pool.query('INSERT INTO confirmacion (reporte_id, usuario_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, req.usuario.id]);
  const { rows } = await pool.query(`UPDATE reporte SET estado='confirmado' WHERE id=$1 AND estado='sin_confirmar' AND (SELECT count(*) FROM confirmacion WHERE reporte_id=$1) >= $2 RETURNING estado`, [id, cfg.confirmacionesMin]);
  res.json({ ok: true, estado: rows[0] ? 'confirmado' : r.rows[0].estado });
}));

// Notificaciones del usuario
app.get('/api/notificaciones', auth.requiere(), wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT id, reporte_id, mensaje, distancia_m, leida, creado_en FROM notificacion WHERE usuario_id=$1 ORDER BY creado_en DESC LIMIT 30`, [req.usuario.id]);
  res.json(rows);
}));
app.post('/api/notificaciones/:id/leer', auth.requiere(), wrap(async (req, res) => {
  await pool.query('UPDATE notificacion SET leida=TRUE WHERE id=$1 AND usuario_id=$2', [+req.params.id, req.usuario.id]); res.json({ ok: true });
}));

// RF5 – administración
app.get('/api/admin/reportes', auth.requiere('admin'), wrap(async (_, res) => {
  const { rows } = await pool.query(`SELECT r.id, r.nivel, r.estado, r.descripcion, r.foto, r.creado_en, u.nombre autor, z.nombre zona, ST_Y(r.ubicacion::geometry) lat, ST_X(r.ubicacion::geometry) lng, (SELECT count(*)::int FROM confirmacion c WHERE c.reporte_id=r.id) confirmaciones, (SELECT count(*)::int FROM notificacion n WHERE n.reporte_id=r.id) alertas FROM reporte r JOIN usuario u ON u.id=r.usuario_id LEFT JOIN zona_riesgo z ON z.id=r.zona_id ORDER BY r.creado_en DESC LIMIT 100`);
  res.json(rows);
}));
app.patch('/api/admin/reportes/:id', auth.requiere('admin'), wrap(async (req, res) => {
  const { estado } = req.body || {};
  if (!['confirmado', 'resuelto', 'descartado'].includes(estado)) return res.status(400).json({ error: 'Estado inválido.' });
  const { rowCount } = await pool.query('UPDATE reporte SET estado=$1 WHERE id=$2', [estado, +req.params.id]);
  rowCount ? res.json({ ok: true }) : res.status(404).json({ error: 'Reporte no encontrado.' });
}));

// RF6 – estadísticas
app.get('/api/admin/estadisticas', auth.requiere('admin'), wrap(async (_, res) => {
  const q = (s) => pool.query(s).then(r => r.rows);
  const [porZona, porDia, porEstado, tiempos] = await Promise.all([
    q(`SELECT coalesce(z.nombre,'Fuera de zonas piloto') zona, count(*)::int total FROM reporte r LEFT JOIN zona_riesgo z ON z.id=r.zona_id GROUP BY 1 ORDER BY 2 DESC`),
    q(`SELECT to_char(creado_en::date,'YYYY-MM-DD') dia, count(*)::int total FROM reporte GROUP BY 1 ORDER BY 1 DESC LIMIT 14`),
    q(`SELECT estado, count(*)::int total FROM reporte GROUP BY 1`),
    q(`SELECT count(*)::int alertas, round((avg(extract(epoch FROM (n.creado_en - r.creado_en))) FILTER (WHERE n.origen='reporte'))::numeric,2) seg_promedio, round((max(extract(epoch FROM (n.creado_en - r.creado_en))) FILTER (WHERE n.origen='reporte'))::numeric,2) seg_maximo FROM notificacion n JOIN reporte r ON r.id=n.reporte_id`),
  ]);
  res.json({ por_zona: porZona, por_dia: porDia, por_estado: porEstado, alertas: tiempos[0] });
}));

if (require.main === module) app.listen(cfg.port, () => console.log(`AlertaArroyo en http://localhost:${cfg.port}`));
module.exports = app;
