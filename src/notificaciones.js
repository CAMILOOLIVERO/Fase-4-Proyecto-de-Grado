// Servicio de notificaciones por proximidad (RF4)
const pool = require('./db'); const cfg = require('./config');
let transporte = null;
if (cfg.smtp) transporte = require('nodemailer').createTransport(cfg.smtp);

const ETIQUETA = { bajo: 'nivel BAJO', medio: 'nivel MEDIO', alto: 'nivel ALTO' };

// Crea una notificación para cada usuario (distinto del autor) con ubicación reciente
// dentro del radio del reporte. Devuelve la cantidad de alertas generadas.
async function alertarCercanos(reporte) {
  const { rows } = await pool.query(`
    INSERT INTO notificacion (reporte_id, usuario_id, mensaje, distancia_m, canal, origen)
    SELECT r.id, u.id,
           'Alerta: arroyo con ' || $2 || ' reportado a ' || round(ST_Distance(u.ubicacion, r.ubicacion))::int || ' m de tu ubicación. Evita la zona.',
           round(ST_Distance(u.ubicacion, r.ubicacion))::int,
           CASE WHEN $5::boolean THEN 'correo' ELSE 'app' END, 'reporte'
    FROM reporte r JOIN usuario u
      ON u.ubicacion IS NOT NULL AND u.id <> r.usuario_id
     AND u.ubicacion_en > now() - make_interval(mins => $4)
     AND ST_DWithin(u.ubicacion, r.ubicacion, $3)
    WHERE r.id = $1
    ON CONFLICT (reporte_id, usuario_id) DO NOTHING
    RETURNING usuario_id, mensaje`, [reporte.id, ETIQUETA[reporte.nivel], cfg.radioAlertaM, cfg.frescuraUbicacionMin, !!transporte]);
  if (transporte && rows.length) {
    const ids = rows.map(r => r.usuario_id);
    const { rows: us } = await pool.query('SELECT id, correo FROM usuario WHERE id = ANY($1)', [ids]);
    for (const u of us) {
      const m = rows.find(r => r.usuario_id === u.id).mensaje;
      transporte.sendMail({ from: cfg.smtpFrom, to: u.correo, subject: 'AlertaArroyo – alerta cercana', text: m }).catch(() => {});
    }
  }
  return rows.length;
}

// Cuando un usuario actualiza su ubicación, se le alerta de reportes activos ya existentes cerca.
async function alertarUsuario(usuarioId) {
  const { rowCount } = await pool.query(`
    INSERT INTO notificacion (reporte_id, usuario_id, mensaje, distancia_m, origen)
    SELECT r.id, u.id,
           'Alerta: arroyo con nivel ' || upper(r.nivel) || ' reportado a ' || round(ST_Distance(u.ubicacion, r.ubicacion))::int || ' m de tu ubicación. Evita la zona.',
           round(ST_Distance(u.ubicacion, r.ubicacion))::int, 'ubicacion'
    FROM usuario u JOIN reporte r
      ON r.estado IN ('sin_confirmar','confirmado')
     AND r.creado_en > now() - make_interval(hours => $2)
     AND r.usuario_id <> u.id AND ST_DWithin(u.ubicacion, r.ubicacion, $3)
    WHERE u.id = $1
    ON CONFLICT (reporte_id, usuario_id) DO NOTHING`, [usuarioId, cfg.vigenciaReporteH, cfg.radioAlertaM]);
  return rowCount;
}
module.exports = { alertarCercanos, alertarUsuario };
