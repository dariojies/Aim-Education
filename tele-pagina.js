// ─────────────────────────────────────────────────────────────────────────────
// La página que abre la tele de recepción: /tele/<clave> (ver pantallas.js).
// La tele (LG 55XS4J, webOS Signage 4.1) lleva un Chromium 53 de 2016, así que
// esto es HTML suelto con JavaScript de entonces (var, function, XMLHttpRequest;
// nada de async, ?. ni ??), sin la web de React.
// - Pide el carrusel (/api/publico/pantallas/<clave>) y lo vuelve a pedir cada
//   minuto; si cambia, lo nuevo entra al acabar la vuelta.
// - Baja cada imagen y cada vídeo una vez y lo guarda en la tele (IndexedDB): no
//   se descarga en cada vuelta y, si se va internet, sigue con lo que tiene.
// - Pasa de uno a otro con fundido (o de golpe): las imágenes, sus segundos; los
//   vídeos, hasta que acaban. Siempre sin sonido.
// - Horario: lo que tiene días u horas solo sale cuando toca. Lo decide la tele
//   en cada paso, con la hora de Madrid que le da el servidor (si su reloj va mal
//   o está en otra zona, da igual). Lo de fuera de horario sigue guardado, para
//   no bajarlo otra vez. El día de la semana es el del momento (de 22:00 a 02:00
//   un viernes sale el viernes por la noche, y el sábado de madrugada si el
//   sábado también está marcado).
// - girar: si la tele está de pie pero su menú no lo sabe, se gira aquí.
// - Cada 6 horas se recarga sola (para que una tele que no se apaga no se canse).
// ─────────────────────────────────────────────────────────────────────────────
export function paginaTele(clave) {
    return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="icon" href="data:,">
<title>Aim Education</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; cursor: none; }
  #giro { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden; background: #000; }
  .capa { position: absolute; left: 0; top: 0; width: 100%; height: 100%; opacity: 0; transition: opacity .8s ease; }
  .capa.sin { transition: none; }
  .capa.ver { opacity: 1; }
  .capa img, .capa video { width: 100%; height: 100%; object-fit: contain; display: block; background: #000; }
  #nada { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: -webkit-box; display: flex; align-items: center; justify-content: center;
          color: #fff; font: 600 3vmin sans-serif; text-align: center; }
</style>
</head><body>
<div id="giro"><div class="capa" id="a"></div><div class="capa" id="b"></div><div id="nada">Aim Education</div></div>
<script>
(function () {
  var CLAVE = ${JSON.stringify(clave)};
  var API = '/api/publico/pantallas/' + CLAVE;
  var actual = null, pendiente = null, indice = -1, capa = 0, temporizador = null, urls = {}, db = null;
  var nada = document.getElementById('nada'), capas = [document.getElementById('a'), document.getElementById('b')];

  function pedir(url, tipo, ok, mal) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    if (tipo) x.responseType = tipo;
    x.timeout = tipo === 'blob' ? 600000 : 20000;
    x.onload = function () { if (x.status >= 200 && x.status < 300) ok(x.response); else mal(x.status); };
    x.onerror = x.ontimeout = function () { mal(0); };
    x.send();
  }

  // ── Lo guardado en la tele ──
  function abrirDb(listo) {
    try {
      var r = indexedDB.open('aim-tele', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('medios'); };
      r.onsuccess = function () { db = r.result; listo(); };
      r.onerror = function () { listo(); };
    } catch (e) { listo(); }
  }
  function leer(url, ok) {
    if (!db) return ok(null);
    try { var r = db.transaction('medios').objectStore('medios').get(url); r.onsuccess = function () { ok(r.result || null); }; r.onerror = function () { ok(null); }; }
    catch (e) { ok(null); }
  }
  function escribir(url, blob) { if (db) try { db.transaction('medios', 'readwrite').objectStore('medios').put(blob, url); } catch (e) {} }
  // Lo que ya no sale en el carrusel, fuera de la tele.
  function limpiar(lista) {
    var vale = {};
    lista.forEach(function (it) { vale[it.url] = true; });
    Object.keys(urls).forEach(function (u) { if (!vale[u]) { URL.revokeObjectURL(urls[u]); delete urls[u]; } });
    if (!db) return;
    try {
      var r = db.transaction('medios', 'readwrite').objectStore('medios').openCursor();
      r.onsuccess = function () { var c = r.result; if (!c) return; if (!vale[c.key]) c.delete(); c.continue(); };
    } catch (e) {}
  }
  // Cada archivo: de lo guardado; si no está, se baja (uno detrás de otro).
  function tener(lista, listo) {
    var i = 0;
    (function siguiente() {
      if (i >= lista.length) return listo();
      var u = lista[i++].url;
      if (urls[u]) return siguiente();
      leer(u, function (blob) {
        if (blob) { urls[u] = URL.createObjectURL(blob); return siguiente(); }
        pedir(u, 'blob', function (b) { escribir(u, b); urls[u] = URL.createObjectURL(b); siguiente(); },
          function () { siguiente(); });
      });
    })();
  }

  // ── El horario ──
  // Cuánto va el reloj de Madrid por delante del de la tele (en ms).
  function desvioDe(c) {
    var m = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2}):(\\d{2})/.exec((c && c.madrid) || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - Date.now() : null;
  }
  var desvio = null;
  function minutos(hora) { var p = String(hora || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  function tocaAhora(it) {
    var h = it.horario;
    if (!h) return true;
    // Sin la hora del servidor (nunca ha conectado), con el reloj de la tele.
    var t = desvio === null ? new Date() : new Date(Date.now() + desvio);
    var dia = desvio === null ? t.getDay() : t.getUTCDay(), min = desvio === null ? t.getHours() * 60 + t.getMinutes() : t.getUTCHours() * 60 + t.getUTCMinutes();
    dia = dia === 0 ? 7 : dia;
    if (h.dias && h.dias.length && h.dias.indexOf(dia) === -1) return false;
    var de = h.horaDesde ? minutos(h.horaDesde) : 0, a = h.horaHasta ? minutos(h.horaHasta) : 1440;
    return de < a ? (min >= de && min < a) : (min >= de || min < a);
  }

  // ── Pasar ──
  function mostrar() {
    clearTimeout(temporizador);
    var listos = function () { return actual ? actual.items.filter(function (it) { return urls[it.url] && tocaAhora(it); }) : []; };
    var lista = listos();
    // Lo nuevo entra al acabar la vuelta (o ya, si no había nada).
    if (pendiente && (indice === -1 || indice + 1 >= lista.length)) { actual = pendiente; pendiente = null; indice = -1; aplicarAjustes(); lista = listos(); }
    if (!lista.length) { nada.style.display = ''; capas[0].className = capas[1].className = 'capa'; temporizador = setTimeout(mostrar, 10000); return; }
    nada.style.display = 'none';
    indice = (indice + 1) % lista.length;
    var it = lista[indice], sig = capas[1 - capa], ant = capas[capa], hecho = false;
    var pasar = function () { if (hecho) return; hecho = true; mostrar(); };
    var entrar = function () {
      sig.className = 'capa ver' + (actual.transicion === 'corte' ? ' sin' : '');
      ant.className = 'capa' + (actual.transicion === 'corte' ? ' sin' : '');
      var viejo = ant;
      setTimeout(function () { if (viejo !== capas[capa]) { var v = viejo.querySelector('video'); if (v) v.pause(); viejo.innerHTML = ''; } }, 1000);
      capa = 1 - capa;
    };
    sig.innerHTML = '';
    if (it.tipo === 'video') {
      var v = document.createElement('video');
      v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.autoplay = true; v.preload = 'auto';
      v.onended = pasar; v.onerror = function () { setTimeout(pasar, 2000); };
      v.oncanplay = function () { v.oncanplay = null; entrar(); var p = v.play(); if (p && p.catch) p.catch(function () {}); };
      v.src = urls[it.url];
      sig.appendChild(v);
      // Por si el vídeo se queda parado: como mucho lo que dura y un poco más.
      temporizador = setTimeout(pasar, (Math.max(3, it.segundos || 10) + 8) * 1000);
    } else {
      var img = new Image();
      img.onload = function () { entrar(); temporizador = setTimeout(pasar, Math.max(3, it.segundos || 10) * 1000); };
      img.onerror = function () { setTimeout(pasar, 2000); };
      img.src = urls[it.url];
      sig.appendChild(img);
    }
  }

  function aplicarAjustes() {
    var g = (actual && actual.girar) || 0, el = document.getElementById('giro'), W = window.innerWidth, H = window.innerHeight;
    if (g === 90 || g === 270) {
      el.style.width = H + 'px'; el.style.height = W + 'px';
      el.style.transformOrigin = '0 0';
      el.style.transform = g === 90 ? 'translate(' + W + 'px,0) rotate(90deg)' : 'translate(0,' + H + 'px) rotate(270deg)';
    } else {
      el.style.width = '100%'; el.style.height = '100%'; el.style.transformOrigin = '50% 50%';
      el.style.transform = g === 180 ? 'rotate(180deg)' : '';
    }
  }

  // ── Pedir el carrusel ──
  function comprobar(primera) {
    pedir(API + '?t=' + Date.now(), 'json', function (c) {
      if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { return; } }
      if (!c || !c.items) return;
      var d = desvioDe(c);
      if (d !== null) { desvio = d; try { localStorage.setItem('aim-tele-desvio-' + CLAVE, String(d)); } catch (e) {} }
      try { localStorage.setItem('aim-tele-' + CLAVE, JSON.stringify(c)); } catch (e) {}
      if (actual && c.version === actual.version) return;
      tener(c.items, function () {
        limpiar(c.items);
        if (!actual || primera) { actual = c; indice = -1; aplicarAjustes(); mostrar(); }
        else { pendiente = c; if (nada.style.display !== 'none') mostrar(); }   // si no se ve nada, ya
      });
    }, function () {});
  }

  abrirDb(function () {
    // Sin internet al encender: lo último que se vio (y lo que se desviaba el reloj).
    try { var dg = localStorage.getItem('aim-tele-desvio-' + CLAVE); if (dg !== null && !isNaN(+dg)) desvio = +dg; } catch (e) {}
    try { var guardado = JSON.parse(localStorage.getItem('aim-tele-' + CLAVE) || 'null'); if (guardado && guardado.items) { actual = guardado; aplicarAjustes(); tener(guardado.items, mostrar); } } catch (e) {}
    comprobar(!actual);
    setInterval(function () { comprobar(false); }, 60000);
  });
  window.addEventListener('resize', aplicarAjustes);
  setTimeout(function () { location.reload(); }, 6 * 3600 * 1000);
})();
</script>
</body></html>`;
}
