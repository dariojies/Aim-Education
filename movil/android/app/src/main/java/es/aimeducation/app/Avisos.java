package es.aimeducation.app;

import android.Manifest;
import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.ApplicationExitInfo;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.List;

/**
 * Lo común de los avisos de Android (#218, movil/AVISOS.md §6): lo guardado
 * (token, id, activo), los canales, el arranque del servicio y las
 * notificaciones sueltas («en pausa», «vuelve a entrar»).
 */
final class Avisos {

    static final String TAG = "AimAvisos";

    // El servidor, de build.gradle (otro solo en compilaciones de prueba).
    static final String WEB = BuildConfig.SERVIDOR_WEB;
    static final String URL_WS = BuildConfig.SERVIDOR_WS;

    // Canales: uno fijo para la conexión y uno por grupo de aviso
    static final String CANAL_CONEXION = "conexion";
    static final String[] GRUPOS = { "pagos", "clases", "soporte", "brickslab", "fotos" };

    // Ids de notificación. Los avisos van todos con ID_AVISO y el tag = clave.
    static final int ID_CONEXION = 1;
    static final int ID_PAUSA = 2;
    static final int ID_FUERA = 3;
    static final int ID_AVISO = 100;

    static final int COLOR = 0xFF7B3FE4;
    static final String EXTRA_URL = "url";

    private static final String PREFS = "aim_avisos";
    private static final String K_TOKEN = "token";
    private static final String K_ID = "id";
    private static final String K_ACTIVO = "activo";
    // Última vez que se arrancó con la app delante: una parada del usuario anterior a esto ya no cuenta
    private static final String K_PRIMER_PLANO = "primerPlano";

    private Avisos() {}

    // ---- Lo guardado (preferencias privadas de la app) ----

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String token(Context ctx) {
        String t = prefs(ctx).getString(K_TOKEN, null);
        return t == null || t.isEmpty() ? null : t;
    }

    static String id(Context ctx) {
        return prefs(ctx).getString(K_ID, null);
    }

    static void guardarId(Context ctx, String id) {
        prefs(ctx).edit().putString(K_ID, id).apply();
    }

    /** Activo = la familia lo ha encendido y hay token con el que conectar. */
    static boolean activo(Context ctx) {
        return prefs(ctx).getBoolean(K_ACTIVO, false) && token(ctx) != null;
    }

    static void guardarActivo(Context ctx, String token, String id) {
        prefs(ctx).edit().putString(K_TOKEN, token).putString(K_ID, id).putBoolean(K_ACTIVO, true).apply();
    }

    /** Se olvida del token (y del id). Lo usan desactivar(), el botón «Desactivar» y el «fuera» del servidor. */
    static void borrar(Context ctx) {
        prefs(ctx).edit().remove(K_TOKEN).remove(K_ID).putBoolean(K_ACTIVO, false).apply();
    }

    static void marcarPrimerPlano(Context ctx) {
        prefs(ctx).edit().putLong(K_PRIMER_PLANO, System.currentTimeMillis()).apply();
    }

    // ---- Canales ----

    static void crearCanales(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel conexion = new NotificationChannel(
            CANAL_CONEXION,
            ctx.getString(R.string.canal_conexion),
            NotificationManager.IMPORTANCE_LOW
        );
        conexion.setDescription(ctx.getString(R.string.canal_conexion_desc));
        conexion.setShowBadge(false);
        conexion.setSound(null, null);
        conexion.enableVibration(false);
        nm.createNotificationChannel(conexion);

        nm.createNotificationChannel(canal(ctx, "pagos", R.string.canal_pagos, NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(canal(ctx, "clases", R.string.canal_clases, NotificationManager.IMPORTANCE_HIGH));
        nm.createNotificationChannel(canal(ctx, "soporte", R.string.canal_soporte, NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(canal(ctx, "brickslab", R.string.canal_brickslab, NotificationManager.IMPORTANCE_DEFAULT));
        nm.createNotificationChannel(canal(ctx, "fotos", R.string.canal_fotos, NotificationManager.IMPORTANCE_DEFAULT));
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.O)
    private static NotificationChannel canal(Context ctx, String id, int nombre, int importancia) {
        NotificationChannel c = new NotificationChannel(id, ctx.getString(nombre), importancia);
        // Los pagos llevan importes: en la pantalla de bloqueo, sin el contenido
        if ("pagos".equals(id)) c.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        return c;
    }

    /** El grupo del aviso, o soporte si llega uno que esta versión de la app no conoce. */
    static String canalDeGrupo(String grupo) {
        for (String g : GRUPOS) if (g.equals(grupo)) return g;
        return "soporte";
    }

    // ---- Permiso de notificaciones ----

    static boolean puedeNotificar(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled();
    }

    /** Publica una notificación si hay permiso; sin él no hace nada (ni rompe). */
    static void notificar(Context ctx, String tag, int id, Notification n) {
        if (!puedeNotificar(ctx)) return;
        try {
            NotificationManagerCompat.from(ctx).notify(tag, id, n);
        } catch (SecurityException e) {
            Log.w(TAG, "Sin permiso para notificar", e);
        }
    }

    static void quitar(Context ctx, int id) {
        NotificationManagerCompat.from(ctx).cancel(id);
    }

    // ---- Abrir la app ----

    /** Intent para abrir la app; con url (ruta que empieza por /) la WebView va ahí. */
    static PendingIntent abrirApp(Context ctx, String url, int codigo) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) i.putExtra(EXTRA_URL, url);
        return PendingIntent.getActivity(ctx, codigo, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Solo rutas de la propia web: «/dashboard/pagos» sí; «https://…», «//…» o «javascript:» no. */
    static boolean rutaValida(String url) {
        return url != null && url.startsWith("/") && !url.startsWith("//") && url.indexOf('\\') < 0 && url.length() <= 500;
    }

    // ---- Arranque del servicio ----

    /**
     * Arranca el servicio en primer plano. Si el sistema no lo deja (Android 12+
     * desde segundo plano lanza ForegroundServiceStartNotAllowedException, que
     * hereda de IllegalStateException), publica «Avisos en pausa» y devuelve false.
     */
    static boolean arrancar(Context ctx, String accion) {
        Intent i = new Intent(ctx, AvisosService.class);
        if (accion != null) i.setAction(accion);
        try {
            ContextCompat.startForegroundService(ctx, i);
            return true;
        } catch (IllegalStateException | SecurityException e) {
            Log.w(TAG, "El sistema no deja arrancar el servicio", e);
            avisarEnPausa(ctx);
            return false;
        }
    }

    /** Desde la app delante (abrir, volver a ella): arranca si está activo. Es la red de seguridad principal. */
    static void arrancarDesdePrimerPlano(Context ctx, String accion) {
        if (!activo(ctx)) return;
        marcarPrimerPlano(ctx);
        arrancar(ctx, accion);
    }

    /**
     * Si la última vez que murió la app fue porque el usuario la paró (administrador
     * de tareas, «Forzar detención»), no se vuelve a encender sola hasta que la abra.
     */
    static boolean paradaPorElUsuario(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return false;
        try {
            ActivityManager am = ctx.getSystemService(ActivityManager.class);
            if (am == null) return false;
            List<ApplicationExitInfo> salidas = am.getHistoricalProcessExitReasons(ctx.getPackageName(), 0, 1);
            if (salidas == null || salidas.isEmpty()) return false;
            ApplicationExitInfo ultima = salidas.get(0);
            if (ultima.getReason() != ApplicationExitInfo.REASON_USER_REQUESTED) return false;
            // Si después la ha abierto, ya lo ha vuelto a querer
            return ultima.getTimestamp() > prefs(ctx).getLong(K_PRIMER_PLANO, 0);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Para el servicio y se olvida del token. El servidor no se entera: eso lo hace la web (DELETE). */
    static void desactivar(Context ctx) {
        borrar(ctx);
        cancelarVigilante(ctx);
        ctx.stopService(new Intent(ctx, AvisosService.class));
        quitar(ctx, ID_PAUSA);
        quitar(ctx, ID_CONEXION);
    }

    // ---- Notificaciones sueltas ----

    static void avisarEnPausa(Context ctx) {
        crearCanales(ctx);
        Notification n = new NotificationCompat.Builder(ctx, CANAL_CONEXION)
            .setSmallIcon(R.drawable.ic_stat_aim)
            .setColor(COLOR)
            .setContentTitle(ctx.getString(R.string.pausa_titulo))
            .setContentText(ctx.getString(R.string.pausa_texto))
            .setContentIntent(abrirApp(ctx, null, ID_PAUSA))
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build();
        notificar(ctx, null, ID_PAUSA, n);
    }

    static void avisarFuera(Context ctx) {
        crearCanales(ctx);
        Notification n = new NotificationCompat.Builder(ctx, CANAL_CONEXION)
            .setSmallIcon(R.drawable.ic_stat_aim)
            .setColor(COLOR)
            .setContentTitle(ctx.getString(R.string.fuera_titulo))
            .setContentText(ctx.getString(R.string.fuera_texto))
            .setStyle(new NotificationCompat.BigTextStyle().bigText(ctx.getString(R.string.fuera_texto)))
            .setContentIntent(abrirApp(ctx, null, ID_FUERA))
            .setAutoCancel(true)
            .build();
        notificar(ctx, null, ID_FUERA, n);
    }

    // ---- Vigilante: alarma inexacta cada ~10 min (setAndAllowWhileIdle, sin permiso de alarmas exactas) ----

    static final long CADA_VIGILANTE = 10 * 60 * 1000L;

    private static PendingIntent intentVigilante(Context ctx) {
        Intent i = new Intent(ctx, VigilanteReceiver.class);
        return PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void programarVigilante(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + CADA_VIGILANTE,
            intentVigilante(ctx)
        );
    }

    static void cancelarVigilante(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(intentVigilante(ctx));
    }
}
