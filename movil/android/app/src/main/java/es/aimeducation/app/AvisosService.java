package es.aimeducation.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.security.SecureRandom;
import java.util.Random;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Servicio en primer plano (tipo specialUse) que mantiene la conexión con
 * wss://www.aimeducation.es/ws/avisos y pinta los avisos (movil/AVISOS.md §5 y §6).
 *
 * Todo el estado se toca solo desde un hilo propio («avisos»); los callbacks de
 * OkHttp y de la red se pasan a ese hilo. Cada socket lleva una «generación»
 * para ignorar lo que llegue de uno ya cerrado.
 */
public class AvisosService extends Service {

    static final String ACCION_COMPROBAR = "es.aimeducation.app.avisos.COMPROBAR";
    static final String ACCION_RECONECTAR = "es.aimeducation.app.avisos.RECONECTAR";
    static final String ACCION_DESACTIVAR = "es.aimeducation.app.avisos.DESACTIVAR";

    // Sin nada del servidor en este tiempo, el vigilante manda un ping
    private static final long SILENCIO_MAX = 90_000L;
    // Y si el pong no llega en este tiempo, reconecta
    private static final long ESPERA_PONG = 8_000L;
    // Wake lock corto: solo mientras se pinta un aviso o se espera el pong
    private static final long WAKE_LOCK_MAX = 10_000L;

    private static final int CIERRE_REINICIO = 1012;
    private static final int CIERRE_FUERA = 1008;

    /** Lo que el plugin necesita saber; vale null cuando el servicio no está vivo. */
    interface Oyente {
        void cambioDeEstado();
    }

    static volatile Oyente oyente;
    static volatile AvisosService instancia;
    static volatile boolean conectado;
    static volatile long ultimoContacto; // ms (reloj del móvil); 0 = nunca en esta ejecución

    private HandlerThread hilo;
    private Handler handler;
    private OkHttpClient cliente;
    private ConnectivityManager.NetworkCallback oyenteRed;
    private final Random azar = new SecureRandom();

    private WebSocket socket;
    private int generacion;
    private boolean conectando;
    private long conectadoDesde;
    private int intentos;
    private Network redActual;
    private boolean enPrimerPlano;
    private final Runnable reintento = this::conectar;

    // ---- Ciclo de vida ----

    @Override
    public void onCreate() {
        super.onCreate();
        Avisos.crearCanales(this);
        hilo = new HandlerThread("avisos");
        hilo.start();
        handler = new Handler(hilo.getLooper());
        cliente = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS) // la conexión está callada casi siempre
            .pingInterval(0, TimeUnit.MILLISECONDS) // el latido lo lleva el servidor (ping cada 40 s)
            .retryOnConnectionFailure(true)
            .build();
        escucharRed();
        instancia = this;
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        String accion = intent != null ? intent.getAction() : null;

        // Botón «Desactivar» de la notificación fija
        if (ACCION_DESACTIVAR.equals(accion)) {
            // Que el servidor lo quite también (si no hay conexión, lo purga él con el tiempo)
            WebSocket ws = socket;
            if (ws != null && conectado) ws.send("{\"t\":\"baja\"}");
            Avisos.desactivar(this);
            detener();
            avisarCambio();
            return START_NOT_STICKY;
        }

        // Antes que nada, a primer plano: si no, Android cierra la app a los pocos segundos
        if (!ponerEnPrimerPlano()) {
            Avisos.avisarEnPausa(this);
            detener();
            return START_NOT_STICKY;
        }
        Avisos.quitar(this, Avisos.ID_PAUSA);

        if (!Avisos.activo(this)) {
            detener();
            return START_NOT_STICKY;
        }

        Avisos.programarVigilante(this);
        if (ACCION_RECONECTAR.equals(accion)) {
            handler.post(this::reconectarYa);
        } else if (ACCION_COMPROBAR.equals(accion)) {
            handler.post(this::vigilar);
        } else {
            handler.post(() -> {
                if (!conectado && !conectando) reconectarYa();
            });
        }
        // Si Android lo cierra por memoria, que lo vuelva a abrir (sin fiarse del todo: está el vigilante)
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        instancia = null;
        dejarDeEscucharRed();
        dejarDormir();
        // El cierre se hace en el hilo «avisos», que es el dueño del socket; después el hilo termina
        handler.removeCallbacksAndMessages(null);
        handler.post(() -> {
            generacion++;
            if (socket != null) socket.close(1000, null);
            socket = null;
            conectando = false;
            conectado = false;
            cliente.dispatcher().executorService().shutdown();
            avisarCambio();
        });
        hilo.quitSafely();
        super.onDestroy();
    }

    /** Android 15+: si el sistema da por agotado el tiempo del servicio, se para sin romper. */
    @Override
    public void onTimeout(int startId, int fgsType) {
        Log.w(Avisos.TAG, "onTimeout del servicio");
        detener();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void detener() {
        try {
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        } catch (RuntimeException ignorada) {
            // Si nunca llegó a primer plano no hay nada que quitar
        }
        stopSelf();
    }

    // ---- Notificación fija «Conectado» ----

    private boolean ponerEnPrimerPlano() {
        try {
            Notification n = notificacionConexion();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceCompat.startForeground(this, Avisos.ID_CONEXION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(Avisos.ID_CONEXION, n);
            }
            enPrimerPlano = true;
            return true;
        } catch (IllegalStateException | SecurityException e) {
            // Android 12+: ForegroundServiceStartNotAllowedException (hereda de IllegalStateException)
            Log.w(Avisos.TAG, "No se puede poner en primer plano", e);
            return false;
        }
    }

    private Notification notificacionConexion() {
        boolean ok = conectado;
        Intent desactivar = new Intent(this, AvisosService.class).setAction(ACCION_DESACTIVAR);
        PendingIntent piDesactivar = PendingIntent.getService(
            this,
            1,
            desactivar,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, Avisos.CANAL_CONEXION)
            .setSmallIcon(R.drawable.ic_stat_aim)
            .setColor(Avisos.COLOR)
            .setContentTitle(getString(ok ? R.string.conexion_conectado : R.string.conexion_reconectando))
            .setContentText(getString(ok ? R.string.conexion_conectado_texto : R.string.conexion_reconectando_texto))
            .setContentIntent(Avisos.abrirApp(this, null, Avisos.ID_CONEXION))
            .addAction(0, getString(R.string.conexion_desactivar), piDesactivar)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build();
    }

    private void actualizarNotificacion() {
        if (!enPrimerPlano) return;
        Avisos.notificar(this, null, Avisos.ID_CONEXION, notificacionConexion());
    }

    // ---- Conexión ----

    private void reconectarYa() {
        intentos = 0;
        conectar();
    }

    // Mientras se reconecta, la CPU despierta (como mucho lo que dure la espera y
    // el saludo): si se duerme, los reintentos con postDelayed no corren hasta el
    // siguiente vigilante (~10 min). Se suelta al conectar o si la espera es larga.
    @Nullable
    private PowerManager.WakeLock wlReconexion;
    private static final long ESPERA_DESPIERTO_MAX = 20_000L;

    private void mantenerDespierto(long ms) {
        if (wlReconexion == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wlReconexion = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "aim:reconexion");
            wlReconexion.setReferenceCounted(false);
        }
        wlReconexion.acquire(ms);
    }

    private void dejarDormir() {
        soltar(wlReconexion);
    }

    private void conectar() {
        handler.removeCallbacks(reintento);
        String token = Avisos.token(this);
        if (token == null || !Avisos.activo(this)) {
            detener();
            return;
        }
        cerrarSocket();
        final int gen = ++generacion;
        conectando = true;
        // El saludo (TCP, TLS y WebSocket) con la CPU despierta
        mantenerDespierto(ESPERA_DESPIERTO_MAX);
        Request peticion = new Request.Builder()
            .url(Avisos.URL_WS)
            // El token va en la cabecera, nunca en la URL (Heroku guarda las rutas en los logs)
            .header("Authorization", "Bearer " + token)
            .header("User-Agent", "AimEducationApp/" + BuildConfig.VERSION_NAME + " Android")
            .build();
        socket = cliente.newWebSocket(peticion, new OyenteSocket(gen));
    }

    private void cerrarSocket() {
        generacion++;
        if (socket != null) socket.cancel();
        socket = null;
        conectando = false;
        if (conectado) {
            conectado = false;
            alCambiarConexion();
        }
    }

    private void programarReintento(long espera) {
        handler.removeCallbacks(reintento);
        // Un reintento corto tras un reinicio del servidor (2-15 s) o de los
        // primeros no puede esperar a que el móvil despierte; los demás, y sin
        // red, sí: los recoge el vigilante o la vuelta de la red.
        if (redActual != null && espera <= ESPERA_DESPIERTO_MAX && intentos <= 2) mantenerDespierto(espera + 5_000L);
        else dejarDormir();
        handler.postDelayed(reintento, espera);
    }

    private void alAbrir(int gen) {
        if (gen != generacion) return;
        conectando = false;
        conectado = true;
        conectadoDesde = System.currentTimeMillis();
        marcarContacto();
        alCambiarConexion();
        dejarDormir();
    }

    private void alCerrar(int gen, int codigo, @Nullable Response respuesta) {
        if (gen != generacion) return;
        // onClosing y onClosed llegan los dos: el segundo ya no cuenta
        generacion++;
        socket = null;
        conectando = false;
        boolean estaba = conectado;
        conectado = false;
        if (conectadoDesde > 0 && System.currentTimeMillis() - conectadoDesde >= Reintentos.ESTABLE) intentos = 0;
        conectadoDesde = 0;

        // 1008 o 401 al conectar: el dispositivo ya no vale. No se reintenta.
        if (codigo == CIERRE_FUERA || (respuesta != null && respuesta.code() == 401)) {
            fuera();
            return;
        }
        long espera = codigo == CIERRE_REINICIO ? Reintentos.trasReinicio(azar) : Reintentos.espera(intentos++, azar);
        programarReintento(espera);
        if (estaba) alCambiarConexion();
    }

    private void alMensaje(int gen, String texto) {
        if (gen != generacion) return;
        marcarContacto();
        JSONObject m;
        try {
            m = new JSONObject(texto);
        } catch (JSONException e) {
            return;
        }
        String t = m.optString("t");
        switch (t) {
            case "hola":
                String id = m.optString("id", "");
                if (!id.isEmpty()) Avisos.guardarId(this, id);
                break;
            case "aviso":
                pintarAviso(m);
                break;
            case "fuera":
                generacion++;
                if (socket != null) socket.close(1000, null);
                socket = null;
                conectado = false;
                fuera();
                break;
            default:
                // «pong» y lo que venga en el futuro: basta con haber marcado el contacto
                break;
        }
    }

    /** El servidor dice que el dispositivo ya no vale: se borra el token y se pide entrar otra vez. */
    private void fuera() {
        Log.i(Avisos.TAG, "El servidor ha dado de baja el dispositivo");
        Avisos.borrar(this);
        Avisos.cancelarVigilante(this);
        Avisos.avisarFuera(this);
        dejarDormir();
        detener();
        avisarCambio();
    }

    private void marcarContacto() {
        ultimoContacto = System.currentTimeMillis();
    }

    private void alCambiarConexion() {
        actualizarNotificacion();
        avisarCambio();
    }

    private static void avisarCambio() {
        Oyente o = oyente;
        if (o != null) {
            try {
                o.cambioDeEstado();
            } catch (RuntimeException e) {
                Log.w(Avisos.TAG, "Fallo al avisar al plugin", e);
            }
        }
    }

    // ---- Avisos ----

    private void pintarAviso(JSONObject m) {
        String clave = m.optString("clave", "");
        if (clave.isEmpty()) return;
        String grupo = Avisos.canalDeGrupo(m.optString("grupo"));
        String titulo = m.optString("titulo", getString(R.string.app_name));
        String cuerpo = m.optString("cuerpo", "");
        String url = m.optString("url", "");
        if (!Avisos.rutaValida(url)) url = "/dashboard";

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, grupo)
            .setSmallIcon(R.drawable.ic_stat_aim)
            .setColor(Avisos.COLOR)
            .setContentTitle(titulo)
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setContentIntent(Avisos.abrirApp(this, url, clave.hashCode()))
            .setPriority("clases".equals(grupo) ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT);
        if (!cuerpo.isEmpty()) {
            b.setContentText(cuerpo).setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo));
        }
        if ("pagos".equals(grupo)) b.setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        // El tag es la clave: el mismo aviso otra vez sustituye al anterior, no se repite
        Avisos.notificar(this, clave, Avisos.ID_AVISO, b.build());

        // Recibido: el servidor lo apunta en «avisados». Se devuelve la marca tal cual
        // llegó (fecha ISO o, en los contadores, n).
        try {
            JSONObject ack = new JSONObject();
            ack.put("t", "ack");
            ack.put("clave", clave);
            if (m.has("marca")) ack.put("marca", m.get("marca"));
            else if (m.has("n")) ack.put("marca", m.get("n"));
            if (m.has("n")) ack.put("n", m.get("n"));
            if (socket != null) socket.send(ack.toString());
        } catch (JSONException ignorada) {
            // No pasa con estos valores
        }
    }

    // ---- Vigilante ----

    /** Lo llama el VigilanteReceiver cada ~10 min (y la app al volver a primer plano). */
    void vigilarDesdeFuera() {
        // La alarma solo mantiene la CPU despierta mientras dura el receiver
        mantenerDespierto(ESPERA_DESPIERTO_MAX);
        handler.post(this::vigilar);
    }

    private void vigilar() {
        if (!conectado) {
            // Sin red no hay nada que hacer: ya conectará al volver (onAvailable)
            if (redActual == null && !redDisponible()) {
                dejarDormir();
                return;
            }
            if (!conectando) reconectarYa();
            return;
        }
        if (System.currentTimeMillis() - ultimoContacto < SILENCIO_MAX) {
            dejarDormir();
            return;
        }

        // Mucho silencio: se pregunta. Si no contesta a tiempo, la conexión está muerta.
        final PowerManager.WakeLock wl = wakeLock("aim:vigilante");
        final long enviado = System.currentTimeMillis();
        if (socket == null || !socket.send("{\"t\":\"ping\"}")) {
            soltar(wl);
            reconectarYa();
            return;
        }
        handler.postDelayed(
            () -> {
                if (ultimoContacto < enviado) {
                    Log.i(Avisos.TAG, "Sin pong: reconectando");
                    reconectarYa();
                }
                soltar(wl);
            },
            ESPERA_PONG
        );
    }

    @Nullable
    private PowerManager.WakeLock wakeLock(String etiqueta) {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return null;
        PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, etiqueta);
        wl.setReferenceCounted(false);
        wl.acquire(WAKE_LOCK_MAX);
        return wl;
    }

    private static void soltar(@Nullable PowerManager.WakeLock wl) {
        if (wl != null && wl.isHeld()) wl.release();
    }

    // ---- Red ----

    private void escucharRed() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        oyenteRed = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(@NonNull Network red) {
                handler.post(() -> {
                    boolean cambio = redActual != null && !redActual.equals(red);
                    redActual = red;
                    // Red nueva (wifi ↔ datos) o vuelta tras estar sin red: a conectar ya
                    if (cambio || (!conectado && !conectando)) reconectarYa();
                });
            }

            @Override
            public void onLost(@NonNull Network red) {
                handler.post(() -> {
                    if (!red.equals(redActual)) return;
                    redActual = null;
                    // El socket sobre esa red está muerto; se reintentará al volver la red
                    if (conectado || conectando) {
                        cerrarSocket();
                        programarReintento(Reintentos.espera(intentos++, azar));
                    }
                });
            }
        };
        try {
            cm.registerDefaultNetworkCallback(oyenteRed);
        } catch (RuntimeException e) {
            Log.w(Avisos.TAG, "No se puede escuchar la red", e);
            oyenteRed = null;
        }
    }

    private boolean redDisponible() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        try {
            return cm != null && cm.getActiveNetwork() != null;
        } catch (RuntimeException e) {
            return true;
        }
    }

    private void dejarDeEscucharRed() {
        if (oyenteRed == null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        try {
            if (cm != null) cm.unregisterNetworkCallback(oyenteRed);
        } catch (RuntimeException ignorada) {
            // Ya no estaba registrado
        }
        oyenteRed = null;
    }

    // ---- Callbacks de OkHttp (en sus hilos): todo se pasa al hilo «avisos» ----

    private class OyenteSocket extends WebSocketListener {

        private final int gen;

        OyenteSocket(int gen) {
            this.gen = gen;
        }

        @Override
        public void onOpen(@NonNull WebSocket ws, @NonNull Response respuesta) {
            handler.post(() -> alAbrir(gen));
        }

        @Override
        public void onMessage(@NonNull WebSocket ws, @NonNull String texto) {
            // Ha llegado algo: CPU despierta como mucho 10 s mientras se pinta
            final PowerManager.WakeLock wl = texto.contains("\"aviso\"") ? wakeLock("aim:aviso") : null;
            handler.post(() -> {
                try {
                    alMensaje(gen, texto);
                } finally {
                    soltar(wl);
                }
            });
        }

        @Override
        public void onClosing(@NonNull WebSocket ws, int codigo, @NonNull String motivo) {
            ws.close(1000, null);
            handler.post(() -> alCerrar(gen, codigo, null));
        }

        @Override
        public void onClosed(@NonNull WebSocket ws, int codigo, @NonNull String motivo) {
            handler.post(() -> alCerrar(gen, codigo, null));
        }

        @Override
        public void onFailure(@NonNull WebSocket ws, @NonNull Throwable error, @Nullable Response respuesta) {
            Log.i(Avisos.TAG, "Conexión caída: " + error);
            handler.post(() -> alCerrar(gen, 0, respuesta));
        }
    }
}
