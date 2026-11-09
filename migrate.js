const fs = require('fs'); const path = require('path'); const pool = require('./db');
(async () => {
  await pool.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  const { rows } = await pool.query('SELECT count(*)::int n FROM zona_riesgo');
  if (rows[0].n === 0) await pool.query(fs.readFileSync(path.join(__dirname, '../db/seed.sql'), 'utf8'));
  // administrador inicial (cambiar la clave en producción)
  const auth = require('./auth');
  const correo = process.env.ADMIN_CORREO || 'admin@alertaarroyo.local';
  const clave = process.env.ADMIN_CLAVE || 'Admin12345';
  await pool.query(`INSERT INTO usuario (nombre,correo,clave_hash,rol,acepta_datos)
    VALUES ('Administrador',$1,$2,'admin',TRUE) ON CONFLICT (correo) DO NOTHING`, [correo, auth.hash(clave)]);
  // si ADMIN_CLAVE está definida en el entorno, esa clave es la vigente: cambiarla y reiniciar la actualiza
  if (process.env.ADMIN_CLAVE) await pool.query(`UPDATE usuario SET clave_hash=$2 WHERE correo=$1 AND rol='admin'`, [correo, auth.hash(clave)]);
  console.log('Migración completa. Admin:', correo);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
