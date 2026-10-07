package es.aimeducation.app;

import java.util.Random;

/**
 * Esperas entre reconexiones (movil/AVISOS.md §5). Java puro, para poder probarlo sin Android.
 */
final class Reintentos {

    static final long TOPE = 60_000L;
    // Conectada al menos este tiempo, el contador de intentos vuelve a cero
    static final long ESTABLE = 60_000L;

    private Reintentos() {}

    /** «Full jitter»: random(0, min(60 s, 1 s · 2^n)). */
    static long espera(int intento, Random azar) {
        int n = Math.max(0, Math.min(intento, 16));
        long techo = Math.min(TOPE, 1000L << n);
        return (long) (azar.nextDouble() * techo);
    }

    /** Tras un cierre 1012 (el servidor se reinicia): entre 2 y 15 s al azar, para no llegar todos a la vez. */
    static long trasReinicio(Random azar) {
        return 2000L + (long) (azar.nextDouble() * 13_000L);
    }
}
