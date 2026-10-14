package es.aimeducation.app;

import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.net.URLDecoder;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se registran antes de crear el puente
        registerPlugin(AimAvisosPlugin.class);
        super.onCreate(savedInstanceState);
        // El intent con el que se abre (p. ej. al tocar un aviso) ya pasa por onNewIntent:
        // BridgeActivity.load() lo llama dentro de super.onCreate.
        prepararDescargas();
    }

    /**
     * Descargas (#420): la WebView no descarga nada por sí sola, así que una foto o
     * un álbum en ZIP no hacían nada al pulsarlos. Se le pasan al gestor de
     * descargas de Android, con la cookie de la sesión, y quedan en «Descargas».
     */
    private void prepararDescargas() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().setDownloadListener((url, userAgent, disposicion, mime, largo) -> {
            try {
                String nombre = nombreDescarga(disposicion, url, mime);
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) r.addRequestHeader("Cookie", cookies);
                if (userAgent != null) r.addRequestHeader("User-Agent", userAgent);
                r.setTitle(nombre);
                if (mime != null) r.setMimeType(mime);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                // Desde Android 10, a «Descargas» sin pedir permiso; antes, a la carpeta de la app.
                if (Build.VERSION.SDK_INT >= 29) r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, nombre);
                else r.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, nombre);
                DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                dm.enqueue(r);
                Toast.makeText(this, "Descargando «" + nombre + "»… Lo verás en Descargas.", Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Toast.makeText(this, "No se ha podido descargar.", Toast.LENGTH_LONG).show();
            }
        });
    }

    /** El nombre que manda el servidor (con tildes: filename*=UTF-8''…), o uno sacado de la dirección. */
    static String nombreDescarga(String disposicion, String url, String mime) {
        String nombre = null;
        if (disposicion != null) {
            Matcher m = Pattern.compile("filename\\*=UTF-8''([^;]+)", Pattern.CASE_INSENSITIVE).matcher(disposicion);
            if (m.find()) {
                try { nombre = URLDecoder.decode(m.group(1).trim(), "UTF-8"); } catch (Exception ignorada) { nombre = null; }
            }
            if (nombre == null) {
                Matcher q = Pattern.compile("filename=\"?([^\";]+)\"?", Pattern.CASE_INSENSITIVE).matcher(disposicion);
                if (q.find()) nombre = q.group(1).trim();
            }
        }
        if (nombre == null || nombre.isEmpty()) nombre = URLUtil.guessFileName(url, disposicion, mime);
        nombre = nombre.replaceAll("[\\\\/:*?\"<>|]", " ").trim();
        return nombre.isEmpty() ? "descarga" : nombre;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        abrirUrlDelAviso(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Cada vez que se abre la app: si los avisos están activos y Android paró el servicio, vuelve a arrancar
        Avisos.arrancarDesdePrimerPlano(this, AvisosService.ACCION_COMPROBAR);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Que la cookie de sesión quede guardada aunque Android cierre la app
        CookieManager.getInstance().flush();
    }

    /** Al tocar un aviso llega el extra «url» (una ruta de la web): la WebView va ahí. */
    private void abrirUrlDelAviso(Intent intent) {
        if (intent == null || getBridge() == null) return;
        String url = intent.getStringExtra(Avisos.EXTRA_URL);
        if (!Avisos.rutaValida(url)) return;
        // Una sola vez: si Android vuelve a entregar el mismo intent, no se recarga
        intent.removeExtra(Avisos.EXTRA_URL);
        WebView wv = getBridge().getWebView();
        if (wv == null) return;
        wv.post(() -> wv.loadUrl(Avisos.WEB + url));
    }
}
