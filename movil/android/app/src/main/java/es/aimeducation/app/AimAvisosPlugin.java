package es.aimeducation.app;

import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

/**
 * Plugin «AimAvisos» (movil/AVISOS.md §6). Desde la web:
 * window.Capacitor.registerPlugin('AimAvisos').
 */
@CapacitorPlugin(name = "AimAvisos", permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = AimAvisosPlugin.PERMISO))
public class AimAvisosPlugin extends Plugin {

    static final String PERMISO = "avisos";

    @Override
    public void load() {
        Avisos.crearCanales(getContext());
        AvisosService.oyente = () -> notifyListeners("estado", estado());
    }

    @Override
    protected void handleOnDestroy() {
        AvisosService.oyente = null;
    }

    // ---- Métodos ----

    @PluginMethod
    public void activar(PluginCall call) {
        String token = call.getString("token");
        String id = call.getString("id");
        if (token == null || token.isEmpty() || id == null || id.isEmpty()) {
            call.reject("Faltan token o id");
            return;
        }
        // Android 13+: primero el permiso de notificaciones
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState(PERMISO) != PermissionState.GRANTED) {
            requestPermissionForAlias(PERMISO, call, "trasPermiso");
            return;
        }
        terminarActivar(call);
    }

    @PermissionCallback
    private void trasPermiso(PluginCall call) {
        if (getPermissionState(PERMISO) != PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("activo", false);
            ret.put("motivo", "permiso");
            call.resolve(ret);
            return;
        }
        terminarActivar(call);
    }

    private void terminarActivar(PluginCall call) {
        Context ctx = getContext();
        // Con las notificaciones de la app apagadas en Ajustes no tendría sentido
        if (!Avisos.puedeNotificar(ctx)) {
            JSObject ret = new JSObject();
            ret.put("activo", false);
            ret.put("motivo", "permiso");
            call.resolve(ret);
            return;
        }
        Avisos.guardarActivo(ctx, call.getString("token"), call.getString("id"));
        Avisos.quitar(ctx, Avisos.ID_FUERA);
        Avisos.marcarPrimerPlano(ctx);
        // Si ya estaba conectado con otro token, que vuelva a conectar con el nuevo
        boolean ok = Avisos.arrancar(ctx, AvisosService.ACCION_RECONECTAR);
        if (ok) Avisos.programarVigilante(ctx);
        if (!ok) {
            // La web lo quita también del servidor: aquí no se queda nada a medias
            Avisos.borrar(ctx);
            Avisos.cancelarVigilante(ctx);
            Avisos.quitar(ctx, Avisos.ID_PAUSA);
        }
        JSObject ret = estado();
        if (!ok) {
            ret.put("activo", false);
            ret.put("motivo", "arranque");
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void desactivar(PluginCall call) {
        Avisos.desactivar(getContext());
        JSObject ret = estado();
        ret.put("activo", false);
        ret.put("conectado", false);
        call.resolve(ret);
    }

    @PluginMethod
    public void estado(PluginCall call) {
        call.resolve(estado());
    }

    @PluginMethod
    public void abrirAjustesBateria(PluginCall call) {
        // Sin REQUEST_IGNORE_BATTERY_OPTIMIZATIONS: la ficha de la app, donde está «Batería → Sin restricciones»
        if (abrir(fichaDeLaApp()) || abrir(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            call.resolve();
        } else {
            call.reject("No se pueden abrir los ajustes");
        }
    }

    @PluginMethod
    public void abrirAjustesApp(PluginCall call) {
        if (abrir(fichaDeLaApp())) call.resolve();
        else call.reject("No se pueden abrir los ajustes");
    }

    @PluginMethod
    public void abrirAjustesAvisos(PluginCall call) {
        boolean ok = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            ok = abrir(i);
        }
        if (ok || abrir(fichaDeLaApp())) call.resolve();
        else call.reject("No se pueden abrir los ajustes");
    }

    // ---- Ayudas ----

    /** { activo, conectado, ultimoContacto (ms), permiso, bateriaSinRestriccion, fabricante, id } */
    private JSObject estado() {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        boolean activo = Avisos.activo(ctx);
        ret.put("activo", activo);
        ret.put("conectado", activo && AvisosService.instancia != null && AvisosService.conectado);
        long ultimo = AvisosService.ultimoContacto;
        ret.put("ultimoContacto", ultimo > 0 ? (Object) ultimo : JSONObject.NULL);
        ret.put("permiso", permiso());
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        ret.put("bateriaSinRestriccion", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        ret.put("fabricante", Build.MANUFACTURER);
        String id = Avisos.id(ctx);
        ret.put("id", id != null ? id : JSONObject.NULL);
        return ret;
    }

    /** 'granted' | 'denied' | 'prompt' */
    private String permiso() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            PermissionState s = getPermissionState(PERMISO);
            if (s == PermissionState.GRANTED) return Avisos.puedeNotificar(ctx) ? "granted" : "denied";
            if (s == PermissionState.DENIED) return "denied";
            return "prompt";
        }
        // Antes de Android 13 no hay que pedir nada: solo pueden estar apagadas en Ajustes
        return Avisos.puedeNotificar(ctx) ? "granted" : "denied";
    }

    private Intent fichaDeLaApp() {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
    }

    private boolean abrir(Intent i) {
        try {
            if (getActivity() != null) {
                getActivity().startActivity(i);
            } else {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }
}
