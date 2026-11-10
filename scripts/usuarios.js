// Consulta de usuarios de AlertaArroyo (solo para el administrador del sistema).
//   node scripts/usuarios.js                          -> lista los usuarios y cuántos reportes hizo cada uno
//   node scripts/usuarios.js clave <correo> <nueva>   -> asigna una clave nueva a un usuario
// La base de datos se toma de DATABASE_URL (Neon) o de las variables PGHOST, PGUSER, PGPASSWORD y PGDATABASE.
// Las claves NO se pueden consultar: se guardan cifradas con scrypt (una sola vía) y nadie, ni el administrador, puede leerlas.
const pool = require('../src/db'); const auth = require('../src/auth');
(async () => {
  const [, , orden, correo, nueva] = process.argv;
  if (orden === 'clave') {
    if (!correo || !nueva || nueva.length < 8) { console.error('Uso: node scripts/usuarios.js clave <correo> <clave nueva de 8+ caracteres>'); process.exitCode = 1; return; }
    const r = await pool.query('UPDATE usuario SET clave_hash=$2 WHERE correo=$1', [correo, auth.hash(nueva)]);
    console.log(r.rowCount ? `Clave actualizada para ${correo}.` : `No existe un usuario con el correo ${correo}.`); return;
  }
  const { rows } = await pool.query(`SELECT u.id, u.nombre, u.correo, u.rol, to_char(u.creado_en AT TIME ZONE 'America/Bogota','YYYY-MM-DD HH24:MI') registro, count(r.id)::int reportes
    FROM usuario u LEFT JOIN reporte r ON r.usuario_id=u.id GROUP BY u.id ORDER BY u.id`);
  console.table(rows); console.log(`${rows.length} usuario(s).`);
})().catch(e => { console.error('Error:', e.message); process.exitCode = 1; }).finally(() => pool.end());
