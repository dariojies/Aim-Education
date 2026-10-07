import React, { useState, useEffect } from 'react';
import { I } from './Icons.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// «Sincronizar con mi móvil» (ticket #390). Un enlace privado de suscripción
// con lo de «Mi día» (clases, eventos, turnos y días de cierre) para el
// calendario del móvil: Google Calendar, el de Samsung o el del iPhone.
//
// Es de un solo sentido y no es al momento: el calendario del móvil lo vuelve a
// leer cada pocas horas, cuando lo decide Google (o Apple). Se dice claro en
// pantalla para que nadie piense que «no se actualiza».
// ─────────────────────────────────────────────────────────────────────────────

// Copia al portapapeles (con plan B si el navegador no deja la API moderna).
async function copiar(texto) {
    try { await navigator.clipboard.writeText(texto); return true; }
    catch {
        try {
            const ta = document.createElement('textarea');
            ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch { return false; }
    }
}

const DISPOSITIVOS = [['android', 'Android (Google)'], ['samsung', 'Samsung'], ['iphone', 'iPhone']];
const paso = { margin: 0, paddingLeft: 20, display: 'grid', gap: 6, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 };

function Pasos({ dispositivo }) {
    if (dispositivo === 'iphone') {
        return (
            <ol style={paso}>
                <li>Abre esta pantalla en el iPhone y toca <b>Abrir en el iPhone</b> (o copia el enlace y, en Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → <b>Añadir calendario suscrito</b>, pégalo).</li>
                <li>Toca <b>Suscribirse</b> y luego <b>Añadir</b>.</li>
                <li>Sale en la app Calendario con el nombre «AIM · Mi agenda».</li>
            </ol>
        );
    }
    if (dispositivo === 'samsung') {
        return (
            <div style={{ display: 'grid', gap: 10 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                    El calendario de Samsung no se suscribe a un enlace él solo. Hay dos formas:
                </p>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>A · Con tu cuenta de Google (recomendado)</div>
                <ol style={paso}>
                    <li>Haz los pasos de <b>Android (Google)</b> con la cuenta de Google que tienes en el móvil.</li>
                    <li>En el móvil: Ajustes → Cuentas y copia de seguridad → Administrar cuentas → tu cuenta de Google → Sincronizar cuenta, y deja activado <b>Calendario</b>.</li>
                    <li>En el Calendario de Samsung: menú ☰ → <b>Gestionar calendarios</b> y marca «AIM · Mi agenda».</li>
                </ol>
                <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>B · Sin cuenta de Google</div>
                <ol style={paso}>
                    <li>Instala la app <b>ICSx⁵</b> (en Google Play es de pago; en F-Droid, gratis).</li>
                    <li>En ICSx⁵ toca <b>+</b>, pega el enlace y acepta.</li>
                    <li>El calendario aparece en el de Samsung (menú ☰ → Gestionar calendarios).</li>
                </ol>
            </div>
        );
    }
    return (
        <ol style={paso}>
            <li>La app de Google Calendar del móvil no deja añadir un enlace: se hace una vez desde un ordenador (o desde el navegador del móvil en «versión para ordenador»).</li>
            <li>Entra en <b>calendar.google.com</b> con la misma cuenta de Google que tienes en el móvil y pulsa <b>Añadir a Google Calendar</b> aquí abajo. O, a mano: <b>Otros calendarios</b> → <b>+</b> → <b>Desde URL</b>, pega el enlace y pulsa «Añadir calendario».</li>
            <li>Sale solo en el móvil al rato. Si no aparece, en la app de Google Calendar: menú ☰ → Ajustes → «AIM · Mi agenda» → activa <b>Sincronizar</b>.</li>
        </ol>
    );
}

export default function CalendarioMovil({ onCerrar, showToast }) {
    const [estado, setEstado] = useState(null); // { activo, https, webcal, google }
    const [ocupado, setOcupado] = useState(false);
    const [dispositivo, setDispositivo] = useState(() => /iPhone|iPad/.test(navigator.userAgent) ? 'iphone' : /SM-|Samsung/i.test(navigator.userAgent) ? 'samsung' : 'android');

    useEffect(() => {
        fetch('/api/me/calendario-movil', { credentials: 'include', cache: 'no-store' })
            .then(r => r.ok ? r.json() : { activo: false })
            .then(setEstado)
            .catch(() => setEstado({ activo: false }));
    }, []);

    async function pedir(metodo) {
        setOcupado(true);
        try {
            const r = await fetch('/api/me/calendario-movil', { method: metodo, credentials: 'include' });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) return showToast?.(d.error || 'No se ha podido hacer.');
            setEstado(d);
            return d;
        } catch { showToast?.('Error de conexión.'); }
        finally { setOcupado(false); }
    }

    async function crear() {
        const d = await pedir('POST');
        if (d?.activo) showToast?.('Enlace creado. Ahora añádelo a tu calendario.');
    }
    async function cambiar() {
        if (!window.confirm('Se crea un enlace nuevo y el de ahora deja de funcionar: tendrás que volver a añadirlo en tus calendarios. ¿Seguir?')) return;
        const d = await pedir('POST');
        if (d?.activo) showToast?.('Enlace cambiado. Añade el nuevo a tu calendario.');
    }
    async function quitar() {
        if (!window.confirm('El enlace deja de funcionar y tu calendario del móvil dejará de recibir cambios (lo que ya tenga se queda hasta que quites el calendario allí). ¿Dejar de sincronizar?')) return;
        const d = await pedir('DELETE');
        if (d && !d.activo) showToast?.('Ya no se sincroniza. Quita también el calendario en el móvil.');
    }
    async function copiarEnlace() {
        showToast?.(await copiar(estado.https) ? 'Enlace copiado.' : 'No se ha podido copiar: selecciónalo y cópialo a mano.');
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 2000, display: 'grid', placeItems: 'center', padding: 16, overflowY: 'auto' }}
            onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="cal-movil-titulo"
                style={{ background: 'var(--bg-2)', borderRadius: 20, width: '100%', maxWidth: 560, padding: 24, display: 'grid', gap: 16, margin: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                        <h3 id="cal-movil-titulo" style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Tu agenda en el móvil</h3>
                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.45 }}>
                            Un enlace privado con tus clases, los eventos que das, tus turnos de trabajo y los días que el centro cierra.
                            Tu calendario del móvil lo lee solo. No lleva datos de alumnos ni tus tareas.
                        </p>
                    </div>
                    <button className="icon-btn" onClick={onCerrar} aria-label="Cerrar" style={{ width: 30, height: 30, flexShrink: 0 }}><I.X /></button>
                </div>

                {!estado && <p style={{ margin: 0, color: 'var(--ink-3)', fontSize: 14 }}>Cargando...</p>}

                {estado && !estado.activo && (
                    <button className="btn btn-primary" onClick={crear} disabled={ocupado} style={{ justifySelf: 'start' }}>
                        <I.Calendar width={16} height={16} /> {ocupado ? 'Creando...' : 'Crear mi enlace'}
                    </button>
                )}

                {estado?.activo && (
                    <>
                        <div style={{ display: 'grid', gap: 6 }}>
                            <label style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Tu enlace</label>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input readOnly value={estado.https} onFocus={e => e.target.select()}
                                    style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12, padding: '9px 10px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--bg-3)', color: 'var(--ink)' }} />
                                <button className="btn btn-sm btn-outline" onClick={copiarEnlace}>Copiar</button>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <a className="btn btn-sm btn-primary" href={estado.google} target="_blank" rel="noopener noreferrer">
                                    <I.Calendar width={14} height={14} /> Añadir a Google Calendar
                                </a>
                                <a className="btn btn-sm btn-outline" href={estado.webcal}>Abrir en el iPhone</a>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {DISPOSITIVOS.map(([v, l]) => (
                                    <button key={v} type="button" className={`filter-pill ${dispositivo === v ? 'is-active' : ''}`}
                                        onClick={() => setDispositivo(v)}>{l}</button>
                                ))}
                            </div>
                            <Pasos dispositivo={dispositivo} />
                        </div>
                    </>
                )}

                <div style={{ background: 'color-mix(in oklab, var(--orange) 8%, var(--bg-2))', border: '1px solid color-mix(in oklab, var(--orange) 30%, var(--line))', borderRadius: 12, padding: '10px 12px', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    <b>No es al momento.</b> Google (y el iPhone) vuelven a leer el calendario cada pocas horas, a veces hasta un día:
                    un cambio de horario tarda en llegar al móvil. Es de un solo sentido: lo que cambies en el móvil no llega a la web.
                    Quien tenga el enlace ve tu horario, así que no lo compartas; si se te escapa, cámbialo.
                </div>

                {estado?.activo && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-outline" onClick={cambiar} disabled={ocupado} title="El enlace de ahora deja de funcionar">Cambiar enlace</button>
                        <button className="btn btn-sm btn-outline" onClick={quitar} disabled={ocupado} style={{ color: 'var(--red, #dc2626)' }}>Dejar de sincronizar</button>
                    </div>
                )}
            </div>
        </div>
    );
}
