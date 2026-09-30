package fr.gobble.hybrid;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Button;
import android.widget.LinearLayout;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.Collections;

public final class MainActivity extends ComponentActivity {
    private WebView webView;
    private BundledAssets bundledAssets;
    private int orientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
    private long started;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        started = SystemClock.elapsedRealtime();
        setRequestedOrientation(orientation);
        try {
            // Comparison and loopback test switches are debug-only. Code stays on the web.
            boolean bundledMedia = !BuildConfig.DEBUG || getIntent().getBooleanExtra("bundledMedia", true);
            String fixtureOrigin = BuildConfig.DEBUG ? getIntent().getStringExtra("fixtureOrigin") : null;
            bundledAssets = new BundledAssets(getAssets(), getCacheDir(), bundledMedia, fixtureOrigin);
            webView = new WebView(this);
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
            if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                    || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                throw new IllegalStateException("Mets Android System WebView à jour pour ouvrir ce prototype.");
            }
            FrameLayout container = new FrameLayout(this);
            container.setBackgroundColor(Color.rgb(11, 23, 42));
            container.addView(webView, new FrameLayout.LayoutParams(-1, -1));
            ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
                int nativeTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
                Insets bars = insets.getInsets(nativeTypes);
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                // The native container already reserves these areas. Forward
                // zeroes so WebView's CSS safe areas cannot add them a second
                // time. Keep IME updates flowing for keyboard/viewport resizing.
                return new WindowInsetsCompat.Builder(insets)
                        .setInsets(nativeTypes, Insets.NONE)
                        .build();
            });
            setContentView(container);
            configureWebView();
            installBridge();
            getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
                @Override public void handleOnBackPressed() { navigateBack(); }
            });
            webView.loadUrl(BundledAssets.ORIGIN + "/", Collections.singletonMap("Cache-Control", "no-cache"));
        } catch (Exception error) {
            Log.e("GobbleHybrid", "Prototype startup failed", error);
            TextView message = new TextView(this);
            message.setText("Le prototype n'a pas pu démarrer.\n" + error.getMessage());
            message.setPadding(32, 80, 32, 32);
            setContentView(message);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " GobbleWrapper/HybridPrototype");
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setBackgroundColor(Color.rgb(11, 23, 42));
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return bundledAssets.intercept(request);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri url = request.getUrl();
                if (BundledAssets.isTrusted(url)) return false;
                if ("https".equals(url.getScheme()) || "mailto".equals(url.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) { }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (BuildConfig.DEBUG) {
                    try { Log.i("GobbleHybrid", bundledAssets.diagnostics().put("pageFinishedMs", SystemClock.elapsedRealtime() - started).toString()); }
                    catch (Exception ignored) { }
                }
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view.getParent() instanceof android.view.ViewGroup) ((android.view.ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                webView = null;
                LinearLayout panel = new LinearLayout(MainActivity.this);
                panel.setOrientation(LinearLayout.VERTICAL);
                panel.setPadding(32, 80, 32, 32);
                TextView message = new TextView(MainActivity.this);
                message.setText("L'affichage du jeu a été interrompu par Android.");
                Button retry = new Button(MainActivity.this);
                retry.setText("Recharger Gobble");
                retry.setOnClickListener(button -> recreate());
                panel.addView(message);
                panel.addView(retry);
                setContentView(panel);
                return true;
            }
        });
    }

    private void installBridge() throws Exception {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return;
        WebViewCompat.addWebMessageListener(webView, "GobbleHostChannel", Collections.singleton(BundledAssets.ORIGIN),
                (view, message, source, mainFrame, reply) -> {
                    if (!mainFrame || !BundledAssets.isTrusted(source)) return;
                    JSONObject response = new JSONObject();
                    try {
                        String data = message.getData();
                        if (data == null || data.length() > 1024) return;
                        JSONObject input = new JSONObject(data);
                        response.put("id", input.getInt("id"));
                        switch (input.getString("command")) {
                            case "orientation":
                                String mode = input.getString("value");
                                if (!"portrait".equals(mode) && !"any".equals(mode)) throw new IllegalArgumentException("Unsupported orientation");
                                orientation = "any".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
                                setRequestedOrientation(orientation);
                                response.put("value", mode);
                                break;
                            case "diagnostics":
                                response.put("value", bundledAssets.diagnostics().put("activityElapsedMs", SystemClock.elapsedRealtime() - started)
                                        .put("requestedOrientation", orientation));
                                break;
                            default: throw new IllegalArgumentException("Unsupported command");
                        }
                    } catch (Exception error) {
                        try { response.put("error", "Android command rejected"); } catch (Exception ignored) { }
                    }
                    reply.postMessage(response.toString());
                });
        WebViewCompat.addDocumentStartJavaScript(webView, BundledAssets.readText(getAssets(), "native-host.js"),
                Collections.singleton(BundledAssets.ORIGIN));
    }

    private void navigateBack() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else moveTaskToBack(true);
    }
    @Override protected void onResume() {
        super.onResume();
        setRequestedOrientation(orientation);
        if (webView != null) webView.onResume();
    }
    @Override protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }
    @Override protected void onDestroy() {
        if (webView != null) { webView.stopLoading(); webView.destroy(); webView = null; }
        if (bundledAssets != null) bundledAssets.close();
        super.onDestroy();
    }
}
