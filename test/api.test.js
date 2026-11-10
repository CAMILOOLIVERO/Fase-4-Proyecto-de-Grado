// Pruebas de aceptación de los requerimientos RF1–RF6 y RNF1, RNF4 (ejecutar con: npm test)
const { test, before, after } = require('node:test'); const assert = require('node:assert/strict');
const pool = require('../src/db'); const app = require('../src/server');
let srv, base; const sfx = Date.now();
const j = async (m, p, body, tok) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, b: await r.json() }; };
const reg = async (n) => (await j('POST', '/api/registro', { nombre: n, correo: `${n}${sfx}@test.co`, clave: 'Clave12345', acepta_datos: true })).b.token;
const REBOLO = { lat: 10.987, lng: -74.784 }, CERCA = { lat: 10.9875, lng: -74.7845 }, LEJOS = { lat: 11.02, lng: -74.85 };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
// crea un reporte con descripción y fotografía (ambas obligatorias)
const rep = async (tok, campos = {}, foto = true) => { const fd = new FormData(); for (const [k, v] of Object.entries(campos)) fd.append(k, v); if (foto) fd.append('foto', new Blob([PNG], { type: 'image/png' }), 'f.png'); const r = await fetch(base + '/api/reportes', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd }); return { s: r.status, b: await r.json() }; };
before(async () => { await new Promise(r => { srv = app.listen(0, r); }); base = 'http://localhost:' + srv.address().port; });
after(async () => { srv.close(); await pool.query(`DELETE FROM reporte WHERE usuario_id IN (SELECT id FROM usuario WHERE correo LIKE '%${sfx}@test.co')`); await pool.query(`DELETE FROM usuario WHERE correo LIKE '%${sfx}@test.co'`); await pool.end(); });

test('RF1: exige autorización de datos y clave mínima', async () => {
  assert.equal((await j('POST', '/api/registro', { nombre: 'x', correo: 'a@b.co', clave: 'Clave12345', acepta_datos: false })).s, 400);
  assert.equal((await j('POST', '/api/registro', { nombre: 'x', correo: 'a@b.co', clave: '123', acepta_datos: true })).s, 400);
  const r = await j('POST', '/api/registro', { nombre: 'dup', correo: `dup${sfx}@test.co`, clave: 'Clave12345', acepta_datos: true });
  assert.equal(r.s, 201);
  assert.equal((await j('POST', '/api/registro', { nombre: 'dup', correo: `dup${sfx}@test.co`, clave: 'Clave12345', acepta_datos: true })).s, 409);
  assert.equal((await j('POST', '/api/login', { correo: `dup${sfx}@test.co`, clave: 'mala' })).s, 401);
  assert.equal((await j('POST', '/api/login', { correo: `dup${sfx}@test.co`, clave: 'Clave12345' })).s, 200);
});

test('RF2–RF4, RNF1, RNF4: reporte → mapa → alerta por proximidad', async () => {
  const autor = await reg('autor'), cerca = await reg('cerca'), lejos = await reg('lejos'), conf1 = await reg('conf1'), conf2 = await reg('conf2');
  await j('POST', '/api/ubicacion', CERCA, cerca); await j('POST', '/api/ubicacion', LEJOS, lejos);
  const t0 = Date.now();
  const r = await rep(autor, { ...REBOLO, nivel: 'alto', descripcion: 'Corriente fuerte' });
  const dt = Date.now() - t0;
  assert.equal(r.s, 201); assert.ok(dt < 60000, 'RNF4: registrar un reporte debe tomar menos de un minuto');
  assert.equal(r.b.reporte.estado, 'sin_confirmar'); assert.ok(r.b.reporte.zona_id, 'se asigna a zona piloto de Rebolo');
  assert.ok(r.b.alertas_enviadas >= 1, 'el usuario cercano recibe alerta');
  const mapa = await j('GET', '/api/reportes'); const t1 = Date.now() - t0;
  assert.ok(mapa.b.features.some(f => f.properties.id === r.b.reporte.id), 'RF3: visible en el mapa'); assert.ok(t1 < 120000, 'RNF1: visible en menos de 2 minutos');
  const nc = (await j('GET', '/api/notificaciones', null, cerca)).b, nl = (await j('GET', '/api/notificaciones', null, lejos)).b;
  assert.equal(nc.filter(n => n.reporte_id === r.b.reporte.id).length, 1); assert.equal(nl.filter(n => n.reporte_id === r.b.reporte.id).length, 0);
  assert.ok(nc[0].distancia_m < 1000);
  // alerta a usuario que ingresa después a la zona con reporte activo
  const tarde = await reg('tarde'); const u = await j('POST', '/api/ubicacion', CERCA, tarde); assert.equal(u.b.alertas_nuevas, 1);
  // confirmación entre ciudadanos
  assert.equal((await j('POST', `/api/reportes/${r.b.reporte.id}/confirmar`, null, autor)).s, 400);
  assert.equal((await j('POST', `/api/reportes/${r.b.reporte.id}/confirmar`, null, conf1)).b.estado, 'sin_confirmar');
  assert.equal((await j('POST', `/api/reportes/${r.b.reporte.id}/confirmar`, null, conf2)).b.estado, 'confirmado');
  globalThis.__rid = r.b.reporte.id;
});

test('RF5–RF6: administración y estadísticas', async () => {
  const adm = (await j('POST', '/api/login', { correo: 'admin@alertaarroyo.local', clave: 'Admin12345' })).b.token;
  const ciud = await reg('ciud');
  assert.equal((await j('GET', '/api/admin/reportes', null, ciud)).s, 403);
  assert.equal((await j('PATCH', `/api/admin/reportes/${globalThis.__rid}`, { estado: 'resuelto' }, adm)).s, 200);
  const mapa = await j('GET', '/api/reportes'); assert.ok(!mapa.b.features.some(f => f.properties.id === globalThis.__rid), 'un reporte resuelto sale del mapa');
  const st = await j('GET', '/api/admin/estadisticas', null, adm); assert.equal(st.s, 200);
  assert.ok(st.b.por_zona.length && st.b.alertas.alertas >= 1);
  const lista = await j('GET', '/api/admin/reportes', null, adm); const rep = lista.b.find(x => x.id === globalThis.__rid);
  assert.ok(rep && rep.descripcion === 'Corriente fuerte' && 'foto' in rep && rep.autor && typeof rep.lat === 'number' && rep.confirmaciones >= 2, 'el administrador ve el detalle completo del reporte');
  assert.ok(+st.b.alertas.seg_maximo < 300, 'RF4: la alerta se genera en menos de 5 minutos');
});

test('RF2: la fotografía se guarda en la base de datos y se sirve por la API', async () => {
  const tok = await reg('foto');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.append('lat', REBOLO.lat); fd.append('lng', REBOLO.lng); fd.append('nivel', 'bajo'); fd.append('descripcion', 'Con fotografía');
  fd.append('foto', new Blob([png], { type: 'image/png' }), 'f.png');
  const r = await fetch(base + '/api/reportes', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd });
  assert.equal(r.status, 201);
  const { reporte } = await r.json();
  const img = await fetch(base + '/api/fotos/' + reporte.id);
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await img.arrayBuffer()).length, png.length);
  assert.equal((await fetch(base + '/api/fotos/99999999')).status, 404);
});

test('Administración: lista de usuarios con su número de reportes', async () => {
  const adm = (await j('POST', '/api/login', { correo: 'admin@alertaarroyo.local', clave: 'Admin12345' })).b.token;
  const ciud = await reg('uslista');
  assert.equal((await j('GET', '/api/admin/usuarios', null, ciud)).s, 403);
  const r = await j('GET', '/api/admin/usuarios', null, adm); assert.equal(r.s, 200);
  const autor = r.b.find(u => u.correo === `autor${sfx}@test.co`);
  assert.ok(autor && autor.reportes >= 1 && 'validados' in autor && !('clave_hash' in autor), 'el autor aparece con sus reportes y sin datos sensibles');
});

test('Administración: eliminar usuarios (y sus datos) con restricciones', async () => {
  const adm = (await j('POST', '/api/login', { correo: 'admin@alertaarroyo.local', clave: 'Admin12345' })).b.token;
  const reg2 = await j('POST', '/api/registro', { nombre: 'borrar', correo: `borrar${sfx}@test.co`, clave: 'Clave12345', acepta_datos: true });
  const tok = reg2.b.token, uid = reg2.b.usuario.id;
  assert.equal((await rep(tok, { ...REBOLO, nivel: 'bajo', descripcion: 'para borrar' })).s, 201);
  const otro = await reg('otro');
  assert.equal((await j('DELETE', `/api/admin/usuarios/${uid}`, null, otro)).s, 403);
  assert.equal((await j('DELETE', '/api/admin/usuarios/99999999', null, adm)).s, 404);
  const admId = (await j('GET', '/api/admin/usuarios', null, adm)).b.find(u => u.rol === 'admin').id;
  assert.equal((await j('DELETE', `/api/admin/usuarios/${admId}`, null, adm)).s, 400);
  const d = await j('DELETE', `/api/admin/usuarios/${uid}`, null, adm);
  assert.equal(d.s, 200); assert.equal(d.b.reportes_eliminados, 1);
  assert.ok(!(await j('GET', '/api/admin/usuarios', null, adm)).b.some(u => u.id === uid), 'el usuario ya no aparece');
  assert.equal((await j('POST', '/api/reportes', { ...REBOLO, nivel: 'bajo' }, tok)).s, 401, 'la sesión de una cuenta eliminada deja de funcionar');
});

test('Reporte: descripción y fotografía son obligatorias', async () => {
  const tok = await reg('oblig');
  assert.equal((await rep(tok, { ...REBOLO, nivel: 'bajo' })).s, 400, 'sin descripción');
  assert.equal((await rep(tok, { ...REBOLO, nivel: 'bajo', descripcion: 'hay agua' }, false)).s, 400, 'sin fotografía');
  assert.equal((await rep(tok, { ...REBOLO, nivel: 'bajo', descripcion: 'hay agua' })).s, 201);
});

test('Reporte: el autor puede editarlo y otro usuario no', async () => {
  const autor = await reg('edita'), otro = await reg('ajeno');
  const id = (await rep(autor, { ...REBOLO, nivel: 'bajo', descripcion: 'primera versión' })).b.reporte.id;
  const patch = async (tok, campos, foto) => { const fd = new FormData(); for (const [k, v] of Object.entries(campos)) fd.append(k, v); if (foto) fd.append('foto', new Blob([PNG], { type: 'image/png' }), 'n.png'); const r = await fetch(base + '/api/reportes/' + id, { method: 'PATCH', headers: { Authorization: 'Bearer ' + tok }, body: fd }); return r.status; };
  assert.equal(await patch(otro, { nivel: 'alto', descripcion: 'intruso' }), 403);
  assert.equal(await patch(autor, { nivel: 'alto', descripcion: '' }), 400, 'la descripción no puede quedar vacía');
  assert.equal(await patch(autor, { nivel: 'medio', descripcion: 'versión corregida' }, true), 200);
  const mis = (await j('GET', '/api/mis-reportes', null, autor)).b.find(r => r.id === id);
  assert.ok(mis && mis.nivel === 'medio' && mis.descripcion === 'versión corregida' && mis.editado_en && mis.foto, 'los cambios quedan guardados y marcados como editados');
  const adm = (await j('POST', '/api/login', { correo: 'admin@alertaarroyo.local', clave: 'Admin12345' })).b.token;
  await j('PATCH', `/api/admin/reportes/${id}`, { estado: 'resuelto' }, adm);
  assert.equal(await patch(autor, { nivel: 'bajo', descripcion: 'tarde' }), 400, 'un reporte cerrado no se edita');
});

test('Tiempo real: un cambio se anuncia a los navegadores conectados', async () => {
  const ctl = new AbortController(); const res = await fetch(base + '/api/eventos', { signal: ctl.signal });
  assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader(); const dec = new TextDecoder(); let texto = '';
  const espera = (async () => { while (!/event: cambio/.test(texto)) { const { value, done } = await reader.read(); if (done) break; texto += dec.decode(value); } return texto; })();
  const tok = await reg('vivo');
  await rep(tok, { ...REBOLO, nivel: 'bajo', descripcion: 'aviso en vivo' });
  const t = await Promise.race([espera, new Promise(r => setTimeout(() => r('sin aviso'), 3000))]);
  ctl.abort(); assert.match(t, /event: cambio/, 'el servidor avisó el cambio');
});
