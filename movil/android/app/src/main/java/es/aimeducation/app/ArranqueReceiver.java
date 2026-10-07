package es.aimeducation.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Al encender el móvil y al actualizar la app, vuelve a arrancar los avisos si
 * estaban activos (movil/AVISOS.md §6). Las dos son excepciones que Android
 * permite para arrancar un servicio en primer plano.
 */
public class ArranqueReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String accion = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(accion) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) return;
        if (!Avisos.activo(ctx)) return;
        // Al actualizar, Android (hasta el 13) cierra la app como si la parase el
        // usuario: esa salida no cuenta, así que se marca como si se hubiera abierto.
        if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(accion)) Avisos.marcarPrimerPlano(ctx);
        // Si el usuario la paró a mano, no se enciende sola: ya lo hará al abrir la app
        else if (Avisos.paradaPorElUsuario(ctx)) return;
        if (Avisos.arrancar(ctx, null)) Avisos.programarVigilante(ctx);
    }
}
