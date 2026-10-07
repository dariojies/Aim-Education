package es.aimeducation.app;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se registran antes de crear el puente
        registerPlugin(AimAvisosPlugin.class);
        super.onCreate(savedInstanceState);
        // El intent con el que se abre (p. ej. al tocar un aviso) ya pasa por onNewIntent:
        // BridgeActivity.load() lo llama dentro de super.onCreate.
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
