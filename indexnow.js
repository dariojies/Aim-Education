// ─────────────────────────────────────────────────────────────────────────────
// IndexNow (ticket #425): al publicar algo, se avisa a los buscadores que lo
// admiten (Bing, Yandex, Seznam, Naver…) para que lo recorran enseguida, sin
// esperar a pasar por el sitemap. Google no lo usa: a Google le llega por el
// sitemap (sitemap.xml y sitemap-noticias.xml) y por Search Console.
//
// La clave se crea sola la primera vez (aim_ajustes 'indexnow') y se publica
// en /indexnow-clave.txt, que es como el buscador comprueba que la web es
// nuestra. Solo avisa desde Heroku (DYNO): en local se trabaja contra la misma
// base, pero no se avisa a nadie.
// ─────────────────────────────────────────────────────────────────────────────
import express from 'express';
import crypto from 'crypto';

export function crearIndexNow({ pool, urlBase, fetch: fetchImpl = (...a) => globalThis.fetch(...a) }) {
    const router = express.Router();
    let clave = null;
    async function laClave() {
        if (clave) return clave;
        const r = await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'indexnow'`);
        clave = r.rows[0]?.valor?.clave || null;
        if (!clave) {
            const nueva = crypto.randomBytes(16).toString('hex');
            await pool.query(`INSERT INTO aim_ajustes (clave, valor) VALUES ('indexnow', $1) ON CONFLICT (clave) DO NOTHING`, [{ clave: nueva }]);
            clave = (await pool.query(`SELECT valor FROM aim_ajustes WHERE clave = 'indexnow'`)).rows[0]?.valor?.clave || nueva;
        }
        return clave;
    }
    router.get('/indexnow-clave.txt', async (req, res) => {
        try { res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(await laClave()); }
        catch { res.status(500).end(); }
    });

    // Avisa de unas direcciones (las de la web, relativas o completas). Nunca
    // falla hacia fuera: si el buscador no contesta, ya pasará por el sitemap.
    async function avisar(rutas) {
        if (!process.env.DYNO || process.env.INDEXNOW === 'no') return { avisado: false };
        const base = urlBase().replace(/\/+$/, '');
        let host;
        try { host = new URL(base).host; } catch { return { avisado: false }; }
        if (/localhost|127\.0\.0\.1/.test(host)) return { avisado: false };
        const urlList = [...new Set(rutas.filter(Boolean).map(r => (r.startsWith('http') ? r : `${base}${r}`)))];
        if (!urlList.length) return { avisado: false };
        try {
            const r = await fetchImpl('https://api.indexnow.org/indexnow', {
                method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ host, key: await laClave(), keyLocation: `${base}/indexnow-clave.txt`, urlList }),
                signal: AbortSignal.timeout(10_000),
            });
            if (r.status >= 400) console.error('[indexnow]', r.status, urlList.join(' '));
            return { avisado: r.status < 400, status: r.status };
        } catch (e) { console.error('[indexnow]', e.message); return { avisado: false }; }
    }
    return { router, avisar };
}
