package es.aimeducation.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * La alarma inexacta de cada ~10 min (movil/AVISOS.md §5). Si el servicio vive,
 * le pide que compruebe la conexión; si Android lo ha cerrado, intenta arrancarlo.
 */
public class VigilanteReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Avisos.activo(ctx) || Avisos.paradaPorElUsuario(ctx)) return;
        Avisos.programarVigilante(ctx);
        AvisosService s = AvisosService.instancia;
        if (s != null) {
            s.vigilarDesdeFuera();
        } else {
            // Desde una alarma inexacta Android 12+ no suele dejar: entonces sale «Avisos en pausa»
            Avisos.arrancar(ctx, null);
        }
    }
}
