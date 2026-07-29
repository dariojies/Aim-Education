import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Mantener una pantalla al día sin que nadie tenga que recargar.
//
// Se vuelve a pedir el dato cada pocos segundos, y además al momento cuando la
// pestaña recupera el foco: es lo que pasa de verdad, alguien atiende a otra
// cosa y vuelve. Mientras la pestaña está oculta no se pide nada, para no tener
// veinte navegadores abiertos machacando la base sin que nadie los mire.
//
// Se consulta la base en cada vuelta a propósito, en vez de avisar desde el
// servidor: así sigue funcionando aunque Heroku levante más de un dyno, donde
// un aviso lanzado en uno no llegaría a quien esté conectado al otro.
// ─────────────────────────────────────────────────────────────────────────────

export function useEnVivo(refrescar, { cada = 10000, activo = true } = {}) {
    const fn = useRef(refrescar);
    fn.current = refrescar;

    useEffect(() => {
        if (!activo) return;
        let parado = false;
        const tira = () => { if (!parado && document.visibilityState === 'visible') fn.current(); };

        const id = setInterval(tira, cada);
        // Al volver a la pestaña no se espera al siguiente turno.
        const alVolver = () => { if (document.visibilityState === 'visible') tira(); };
        document.addEventListener('visibilitychange', alVolver);
        window.addEventListener('focus', alVolver);

        return () => {
            parado = true;
            clearInterval(id);
            document.removeEventListener('visibilitychange', alVolver);
            window.removeEventListener('focus', alVolver);
        };
    }, [cada, activo]);
}
