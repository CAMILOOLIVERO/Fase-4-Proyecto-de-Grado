module.exports = {
  port: process.env.PORT || 3000,
  db: process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } } : {
    host: process.env.PGHOST || 'localhost',
    port: +(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'alertaarroyo',
    password: process.env.PGPASSWORD || 'alertaarroyo',
    database: process.env.PGDATABASE || 'alertaarroyo',
  },
  secreto: process.env.APP_SECRET || 'cambiar-en-produccion',
  radioAlertaM: +(process.env.RADIO_ALERTA_M || 1000),     // radio de proximidad (RF4)
  vigenciaReporteH: +(process.env.VIGENCIA_REPORTE_H || 6), // un reporte activo vence a las 6 h
  frescuraUbicacionMin: +(process.env.FRESCURA_UBICACION_MIN || 30),
  confirmacionesMin: +(process.env.CONFIRMACIONES_MIN || 2),
  smtp: process.env.SMTP_HOST ? {
    host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587),
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  } : null,
  smtpFrom: process.env.SMTP_FROM || 'AlertaArroyo <no-responder@alertaarroyo.local>',
};
