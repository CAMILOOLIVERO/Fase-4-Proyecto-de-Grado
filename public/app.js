(() => {
  const $ = s => document.querySelector(s);
  const CENTRO = [10.9878, -74.7889], nivelColor = { alto: '#c62828', medio: '#ef8c00', bajo: '#f2c200' };
  let token = localStorage.getItem('aa_token'), usuario = JSON.parse(localStorage.getItem('aa_user') || 'null');
  let modoRegistro = false, nivelSel = null, punto = null, ultimaPos = 0, vistas = new Set(JSON.parse(sessionStorage.getItem('aa_vistas') || '[]'));
  const api = async (m, p, body, form) => {
    const h = token ? { Authorization: 'Bearer ' + token } : {}; if (body && !form) h['Content-Type'] = 'application/json';
    const r = await fetch(p, { method: m, headers: h, body: form ? body : body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(d.error || 'Error'), { status: r.status }); return d;
  };

  // ---- mapas ----
  const base = () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  const mapa = L.map('mapa').setView(CENTRO, 13); base().addTo(mapa);
  const capaZonas = L.layerGroup().addTo(mapa), capaRep = L.layerGroup().addTo(mapa); let miPos = null;
  const mapaPick = L.map('mapaPick').setView(CENTRO, 13); base().addTo(mapaPick); let marcaPick = null;
  mapaPick.on('click', e => fijarPunto(e.latlng.lat, e.latlng.lng));
  function fijarPunto(lat, lng) { punto = { lat, lng }; if (marcaPick) marcaPick.setLatLng([lat, lng]); else marcaPick = L.marker([lat, lng]).addTo(mapaPick); $('#coords').textContent = `Punto: ${lat.toFixed(5)}, ${lng.toFixed(5)}`; }

  async function cargarZonas() { const z = await api('GET', '/api/zonas'); L.geoJSON(z, { style: { color: '#0b5cad', weight: 2, fillOpacity: .08 }, onEachFeature: (f, l) => l.bindTooltip(f.properties.nombre) }).addTo(capaZonas); L.geoJSON(z, { style: { color: '#0b5cad', weight: 1, fillOpacity: .05 } }).addTo(mapaPick); }
  const hace = iso => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'hace un momento' : m < 60 ? `hace ${m} min` : `hace ${Math.round(m / 60)} h`; };
  async function cargarReportes() {
    const g = await api('GET', '/api/reportes'); capaRep.clearLayers();
    g.features.forEach(f => {
      const p = f.properties, [lng, lat] = f.geometry.coordinates, sc = p.estado === 'sin_confirmar';
      const m = L.circleMarker([lat, lng], { radius: 11, color: sc ? '#222' : '#fff', weight: sc ? 2 : 2, dashArray: sc ? '3 3' : null, fillColor: nivelColor[p.nivel], fillOpacity: .9 }).addTo(capaRep);
      const div = document.createElement('div'); div.className = 'pop';
      div.innerHTML = `<b>Nivel ${p.nivel.toUpperCase()}</b> · ${sc ? 'sin confirmar' : 'confirmado'}<br>${p.zona || 'Fuera de zonas piloto'}<br><small>${hace(p.creado_en)} · ${p.confirmaciones} confirmaciones</small>${p.descripcion ? `<br>${p.descripcion.replace(/</g, '&lt;')}` : ''}${p.foto ? `<br><img src="${p.foto}" alt="Foto del reporte">` : ''}`;
      if (token) { const b = document.createElement('button'); b.textContent = '✔ Confirmar que lo veo'; b.onclick = async () => { try { await api('POST', `/api/reportes/${p.id}/confirmar`); cargarReportes(); } catch (e) { alert(e.message); } }; div.append(document.createElement('br'), b); }
      m.bindPopup(div);
    });
  }

  // ---- sesión ----
  function pintarSesion() {
    const s = $('#sesion'); $('#tabAdmin').hidden = !(usuario && usuario.rol === 'admin');
    s.innerHTML = usuario ? `<span>${usuario.nombre.replace(/</g, '&lt;')}</span><button id="salir">Salir</button>` : `<button id="entrar">Entrar</button>`;
    if (usuario) $('#salir').onclick = () => { token = null; usuario = null; localStorage.removeItem('aa_token'); localStorage.removeItem('aa_user'); pintarSesion(); cargarReportes(); $('#listaAlertas').innerHTML = ''; $('#nAlertas').hidden = true; };
    else $('#entrar').onclick = () => abrirAuth(false);
  }
  function abrirAuth(reg) { modoRegistro = reg; $('#tituloAuth').textContent = reg ? 'Crear cuenta' : 'Iniciar sesión'; $('#lNombre').hidden = $('#lAcepta').hidden = !reg; $('#btnAuth').textContent = reg ? 'Registrarme' : 'Entrar'; $('#alternar').textContent = reg ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'; $('#msgAuth').textContent = ''; if (!$('#dlgAuth').open) $('#dlgAuth').showModal(); }
  $('#alternar').onclick = e => { e.preventDefault(); abrirAuth(!modoRegistro); };
  $('#cerrarAuth').onclick = () => $('#dlgAuth').close();
  $('#formAuth').addEventListener('submit', async e => {
    e.preventDefault(); const msg = $('#msgAuth'); msg.className = 'msg';
    try {
      const d = modoRegistro ? await api('POST', '/api/registro', { nombre: $('#aNombre').value, correo: $('#aCorreo').value, clave: $('#aClave').value, acepta_datos: $('#aAcepta').checked }) : await api('POST', '/api/login', { correo: $('#aCorreo').value, clave: $('#aClave').value });
      token = d.token; usuario = d.usuario; localStorage.setItem('aa_token', token); localStorage.setItem('aa_user', JSON.stringify(usuario)); $('#dlgAuth').close(); pintarSesion(); iniciarUbicacion(); cargarAlertas(); cargarReportes();
    } catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
  });

  // ---- ubicación y alertas ----
  function iniciarUbicacion() {
    if (!token || !navigator.geolocation) return;
    navigator.geolocation.watchPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords; if (miPos) miPos.setLatLng([lat, lng]); else miPos = L.circleMarker([lat, lng], { radius: 7, color: '#fff', fillColor: '#1976d2', fillOpacity: 1, weight: 3 }).addTo(mapa).bindTooltip('Tu ubicación');
      if (Date.now() - ultimaPos < 20000) return; ultimaPos = Date.now();
      try { const r = await api('POST', '/api/ubicacion', { lat, lng }); if (r.alertas_nuevas) cargarAlertas(); } catch {}
    }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
  }
  async function cargarAlertas() {
    if (!token) return; let ns; try { ns = await api('GET', '/api/notificaciones'); } catch (e) { if (e.status === 401) { token = null; usuario = null; pintarSesion(); } return; }
    const sinLeer = ns.filter(n => !n.leida); $('#nAlertas').textContent = sinLeer.length; $('#nAlertas').hidden = !sinLeer.length;
    $('#listaAlertas').innerHTML = ns.length ? ns.map(n => `<li class="${n.leida ? '' : 'nueva'}">${n.mensaje}<small>${hace(n.creado_en)}</small></li>`).join('') : '<li>Aún no tienes alertas.</li>';
    const nueva = sinLeer.find(n => !vistas.has(n.id));
    if (nueva) { sinLeer.forEach(n => vistas.add(n.id)); sessionStorage.setItem('aa_vistas', JSON.stringify([...vistas])); mostrarBanner(nueva.mensaje); if ('Notification' in window && Notification.permission === 'granted') new Notification('AlertaArroyo', { body: nueva.mensaje }); }
  }
  function mostrarBanner(t) { const b = $('#banner'); b.hidden = false; b.innerHTML = `<span>⚠ ${t}</span><button id="cb">Entendido</button>`; $('#cb').onclick = () => { b.hidden = true; }; if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }

  // ---- reportar ----
  document.querySelectorAll('#niveles button').forEach(b => b.onclick = () => { nivelSel = b.dataset.n; document.querySelectorAll('#niveles button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#btnUbicacion').onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { fijarPunto(p.coords.latitude, p.coords.longitude); mapaPick.setView([p.coords.latitude, p.coords.longitude], 16); }, () => { $('#msgReporte').textContent = 'No se pudo obtener tu ubicación. Toca el mapa para marcar el punto.'; $('#msgReporte').className = 'msg err'; }) : 0;
  $('#formReporte').addEventListener('submit', async e => {
    e.preventDefault(); const msg = $('#msgReporte'); msg.className = 'msg';
    if (!token) { abrirAuth(false); return; }
    if (!punto || !nivelSel) { msg.textContent = 'Marca el punto en el mapa y elige el nivel del agua.'; msg.className = 'msg err'; return; }
    const fd = new FormData(); fd.append('lat', punto.lat); fd.append('lng', punto.lng); fd.append('nivel', nivelSel); fd.append('descripcion', $('#desc').value); if ($('#foto').files[0]) fd.append('foto', $('#foto').files[0]);
    try { const t0 = Date.now(); const r = await api('POST', '/api/reportes', fd, true); msg.textContent = `Reporte enviado (${((Date.now() - t0) / 1000).toFixed(1)} s). Se alertó a ${r.alertas_enviadas} usuario(s) cercano(s).`; msg.className = 'msg ok'; $('#desc').value = ''; $('#foto').value = ''; cargarReportes(); }
    catch (err) { msg.textContent = err.message; msg.className = 'msg err'; }
  });

  // ---- administración ----
  async function cargarAdmin() {
    const [st, rs] = await Promise.all([api('GET', '/api/admin/estadisticas'), api('GET', '/api/admin/reportes')]);
    const tot = st.por_estado.reduce((a, b) => a + b.total, 0);
    $('#stats').innerHTML = `<div class="stat"><b>${tot}</b><span>Reportes totales</span></div><div class="stat"><b>${st.alertas.alertas}</b><span>Alertas enviadas</span></div><div class="stat"><b>${st.alertas.seg_promedio ?? '–'} s</b><span>Tiempo promedio reporte→alerta</span></div>` + st.por_zona.map(z => `<div class="stat"><b>${z.total}</b><span>${z.zona}</span></div>`).join('');
    window.__reps = rs; const esc = t => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    $('#tablaAdmin tbody').innerHTML = rs.map(r => `<tr><td>${r.id}</td><td>${new Date(r.creado_en).toLocaleString('es-CO')}</td><td>${esc(r.zona) || '–'}</td><td><span class="pill ${r.nivel}">${r.nivel}</span></td><td>${r.estado}</td><td><span class="desc" title="${esc(r.descripcion)}">${esc(r.descripcion) || '–'}</span></td><td>${r.foto ? '📷' : '–'}</td><td><button data-ver="${r.id}">Ver detalle</button></td></tr>`).join('');
  }
  function verDetalle(id) {
    const r = (window.__reps || []).find(x => x.id === id); if (!r) return;
    const esc = t => String(t ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    $('#dId').textContent = '#' + r.id;
    $('#dBody').innerHTML = `<dl><dt>Nivel</dt><dd><span class="pill ${r.nivel}">${r.nivel}</span></dd><dt>Estado</dt><dd>${r.estado}</dd><dt>Fecha</dt><dd>${new Date(r.creado_en).toLocaleString('es-CO')}</dd><dt>Reportado por</dt><dd>${esc(r.autor)}</dd><dt>Zona</dt><dd>${esc(r.zona) || 'Fuera de zonas piloto'}</dd><dt>Ubicación</dt><dd>${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}</dd><dt>Descripción</dt><dd>${esc(r.descripcion) || '<i>Sin descripción</i>'}</dd><dt>Confirmaciones</dt><dd>${r.confirmaciones}</dd><dt>Alertas enviadas</dt><dd>${r.alertas}</dd><dt>Fotografía</dt><dd>${r.foto ? `<a href="${esc(r.foto)}" target="_blank" rel="noopener"><img src="${esc(r.foto)}" alt="Fotografía del reporte"></a>` : '<i>Sin fotografía</i>'}</dd></dl>`;
    $('#dAcc').innerHTML = `<button class="prim" data-e="confirmado" data-id="${r.id}">Validar</button><button data-e="resuelto" data-id="${r.id}">Marcar resuelto</button><button data-e="descartar" data-id="${r.id}" style="color:#c62828">Descartar</button>`.replace('data-e="descartar"','data-e="descartado"');
    $('#dlgDetalle').showModal();
  }
  $('#cerrarDet').onclick = () => $('#dlgDetalle').close();
  $('#dAcc').addEventListener('click', async e => { const b = e.target.closest('button'); if (!b) return; await api('PATCH', `/api/admin/reportes/${b.dataset.id}`, { estado: b.dataset.e }); $('#dlgDetalle').close(); cargarAdmin(); cargarReportes(); });
  $('#tablaAdmin').addEventListener('click', e => { const b = e.target.closest('button[data-ver]'); if (b) verDetalle(+b.dataset.ver); });

  // ---- navegación ----
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.vista').forEach(v => v.classList.toggle('on', v.id === 'v-' + b.dataset.vista));
    setTimeout(() => { mapa.invalidateSize(); mapaPick.invalidateSize(); }, 50);
    if (b.dataset.vista === 'alertas') { cargarAlertas().then(async () => { const ns = await api('GET', '/api/notificaciones'); await Promise.all(ns.filter(n => !n.leida).map(n => api('POST', `/api/notificaciones/${n.id}/leer`))); $('#nAlertas').hidden = true; }); } if (b.dataset.vista === 'admin') cargarAdmin().catch(() => {});
    if (b.dataset.vista === 'alertas' && token && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); });

  api('GET', '/api/salud').then(s => { $('#radio').textContent = s.radio_m; }).catch(() => {});
  pintarSesion(); cargarZonas(); cargarReportes(); if (token) { iniciarUbicacion(); cargarAlertas(); }
  setInterval(() => { cargarReportes(); cargarAlertas(); }, 10000);
})();
