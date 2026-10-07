package es.aimeducation.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Random;
import org.junit.Test;

public class ReintentosTest {

    /** Un «azar» fijo: siempre devuelve el mismo valor. */
    private static Random fijo(double v) {
        return new Random() {
            @Override
            public double nextDouble() {
                return v;
            }
        };
    }

    @Test
    public void esperaCreceHastaElTope() {
        Random casiUno = fijo(0.999999);
        assertTrue(Reintentos.espera(0, casiUno) < 1000);
        assertTrue(Reintentos.espera(3, casiUno) < 8000 && Reintentos.espera(3, casiUno) > 7900);
        assertTrue(Reintentos.espera(6, casiUno) < 60_000 && Reintentos.espera(6, casiUno) > 59_000);
        // Sin pasarse nunca de 60 s, ni con muchos intentos
        assertTrue(Reintentos.espera(1000, casiUno) < 60_000);
        assertEquals(0, Reintentos.espera(5, fijo(0)));
        // Un contador negativo no rompe
        assertTrue(Reintentos.espera(-3, casiUno) < 1000);
    }

    @Test
    public void trasReinicioEntre2y15s() {
        assertEquals(2000, Reintentos.trasReinicio(fijo(0)));
        long max = Reintentos.trasReinicio(fijo(0.999999));
        assertTrue(max <= 15_000 && max > 14_900);
        Random r = new Random(7);
        for (int i = 0; i < 1000; i++) {
            long e = Reintentos.trasReinicio(r);
            assertTrue(e >= 2000 && e <= 15_000);
        }
    }

    @Test
    public void soloRutasDeLaWeb() {
        assertTrue(Avisos.rutaValida("/dashboard/pagos"));
        assertTrue(Avisos.rutaValida("/dashboard"));
        assertFalse(Avisos.rutaValida(null));
        assertFalse(Avisos.rutaValida(""));
        assertFalse(Avisos.rutaValida("https://otra.web/"));
        assertFalse(Avisos.rutaValida("//otra.web/"));
        assertFalse(Avisos.rutaValida("javascript:alert(1)"));
        assertFalse(Avisos.rutaValida("/\\otra.web"));
    }
}
