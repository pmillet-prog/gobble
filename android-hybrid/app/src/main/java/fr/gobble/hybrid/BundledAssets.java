package fr.gobble.hybrid;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.*;

/** Web code always belongs to the website. Only current, verified media is local. */
final class BundledAssets implements AutoCloseable {
    static final String ORIGIN = "https://gobble.fr";
    private final MediaCache cache;
    private final PublicMediaSource remote;
    private final boolean bundledMedia, fixture;
    private final String seedVersion;
    private final ExecutorService loader = Executors.newSingleThreadExecutor();
    private volatile Future<Map<String, MediaCache.Entry>> manifest;
    private volatile String mediaVersion = "";
    private final AtomicLong hits = new AtomicLong(), bytes = new AtomicLong(), diskHits = new AtomicLong();

    BundledAssets(AssetManager assets, File cacheDirectory, boolean bundledMedia, String fixtureOrigin) throws Exception {
        this.bundledMedia = bundledMedia;
        fixture = BuildConfig.DEBUG && fixtureOrigin != null;
        if (fixture && !fixtureOrigin.matches("http://127\\.0\\.0\\.1:[0-9]{1,5}")) throw new IOException("Invalid test origin");
        remote = new PublicMediaSource(fixture ? fixtureOrigin : ORIGIN);
        JSONObject seed = new JSONObject(readText(assets, "bundle-manifest.json"));
        seedVersion = seed.getString("version");
        Map<String, MediaCache.Entry> seeds = parseManifest(seed);
        cache = new MediaCache(new File(cacheDirectory, "gobble-public-media-v2"), seeds,
                path -> assets.open("media" + path, AssetManager.ACCESS_STREAMING), remote);
    }

    static boolean isTrusted(Uri uri) {
        return "https".equals(uri.getScheme()) && "gobble.fr".equals(uri.getHost())
                && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }
    private static Map<String, MediaCache.Entry> parseManifest(JSONObject value) throws Exception {
        if (value.getInt("schema") != 2 || !ORIGIN.equals(value.getString("origin"))
                || !value.getString("version").matches("[a-f0-9]{16}")) throw new IOException("Invalid media manifest");
        JSONObject files = value.getJSONObject("files");
        if (files.length() > 2048) throw new IOException("Media manifest too large");
        Map<String, MediaCache.Entry> result = new HashMap<>();
        Iterator<String> keys = files.keys();
        while (keys.hasNext()) {
            String path = keys.next(); JSONObject file = files.getJSONObject(path);
            result.put(path, new MediaCache.Entry(path, file.getString("sha256"), file.getString("mime"), file.getLong("bytes")));
        }
        return Collections.unmodifiableMap(result);
    }
    private synchronized void refreshManifest() {
        if (loader.isShutdown()) return;
        if (manifest != null) manifest.cancel(true);
        manifest = loader.submit(() -> {
            try (InputStream input = remote.open("/native-assets.json")) {
                JSONObject value = new JSONObject(readText(input));
                Map<String, MediaCache.Entry> current = parseManifest(value);
                mediaVersion = value.getString("version");
                return current;
            } catch (Exception error) {
                // An old deployment or a network failure uses normal web loading,
                // never the APK's stale media as a substitute for the live files.
                mediaVersion = "";
                return Collections.emptyMap();
            }
        });
    }
    WebResourceResponse intercept(WebResourceRequest request) {
        if (!isTrusted(request.getUrl())) return null;
        if (request.isForMainFrame() && "GET".equals(request.getMethod())) refreshManifest();
        String path = request.getUrl().getPath();
        if (bundledMedia && !request.isForMainFrame() && "GET".equals(request.getMethod())
                && request.getUrl().getQuery() == null && MediaCache.isMediaPath(path)) {
            try {
                Future<Map<String, MediaCache.Entry>> pending = manifest;
                MediaCache.Entry entry = pending == null ? null : pending.get(8, TimeUnit.SECONDS).get(path);
                if (entry != null) return serve(entry, request.getRequestHeaders());
            } catch (Exception ignored) { /* The WebView can still load the exact requested URL. */ }
        }
        return fixture ? fixtureResponse(request) : null;
    }

    private WebResourceResponse serve(MediaCache.Entry entry, Map<String, String> requestHeaders) throws IOException {
        long start = 0, end = entry.bytes - 1;
        String range = null;
        for (Map.Entry<String, String> header : requestHeaders.entrySet()) if ("range".equalsIgnoreCase(header.getKey())) range = header.getValue();
        Map<String, String> headers = new HashMap<>();
        // Re-enter the native resolver after a navigation instead of retaining
        // an HTTP cache response for a same-name asset from an older deployment.
        headers.put("Cache-Control", "no-store"); headers.put("Accept-Ranges", "bytes");
        if (range != null) {
            Matcher match = Pattern.compile("bytes=(\\d*)-(\\d*)").matcher(range);
            if (!match.matches() || (match.group(1).isEmpty() && match.group(2).isEmpty())) return rangeError(entry.bytes);
            try {
                if (match.group(1).isEmpty()) start = Math.max(0, entry.bytes - Long.parseLong(match.group(2)));
                else { start = Long.parseLong(match.group(1)); if (!match.group(2).isEmpty()) end = Math.min(end, Long.parseLong(match.group(2))); }
            } catch (NumberFormatException error) { return rangeError(entry.bytes); }
            if (start > end || start >= entry.bytes) return rangeError(entry.bytes);
            headers.put("Content-Range", "bytes " + start + "-" + end + "/" + entry.bytes);
        }
        MediaCache.Result result = cache.open(entry);
        InputStream stream = result.stream;
        try {
            long skipped = 0;
            while (skipped < start) {
                long count = stream.skip(start - skipped);
                if (count <= 0) throw new IOException("Invalid media length");
                skipped += count;
            }
        } catch (IOException error) { stream.close(); throw error; }
        long count = end - start + 1;
        headers.put("Content-Length", Long.toString(count)); headers.put("X-Gobble-Asset", result.source);
        hits.incrementAndGet(); bytes.addAndGet(count);
        if ("cache".equals(result.source)) diskHits.incrementAndGet();
        return new WebResourceResponse(entry.mime, null, range == null ? 200 : 206,
                range == null ? "OK" : "Partial Content", headers, new LimitedStream(stream, count));
    }
    JSONObject diagnostics() throws Exception {
        return new JSONObject().put("codeSource", "web").put("bundleVersion", seedVersion).put("mediaVersion", mediaVersion)
                .put("bundledMedia", bundledMedia).put("bundledRequests", hits.get()).put("bundledMediaRequests", hits.get())
                .put("bundledResponseBytes", bytes.get()).put("diskCacheHits", diskHits.get())
                .put("downloadedMediaBytes", cache.downloadedBytes.get()).put("mediaCacheLimitBytes", MediaCache.MAX_CACHE_BYTES);
    }
    private WebResourceResponse rangeError(long length) {
        Map<String, String> headers = new HashMap<>(); headers.put("Content-Range", "bytes */" + length);
        return new WebResourceResponse("text/plain", "UTF-8", 416, "Range Not Satisfiable", headers, new ByteArrayInputStream(new byte[0]));
    }
    // A debug-only loopback fixture makes two web deployments testable with the
    // same APK and trusted page origin, without contacting or changing the VM.
    private WebResourceResponse fixtureResponse(WebResourceRequest request) {
        try {
            if (!BuildConfig.DEBUG || !"GET".equals(request.getMethod())) throw new IOException("Unsupported fixture request");
            HttpURLConnection connection = remote.connect(request.getUrl().getPath());
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) { connection.disconnect(); throw new IOException("Fixture redirect rejected"); }
            String mime = connection.getContentType();
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse(mime == null ? "application/octet-stream" : mime.split(";")[0], "UTF-8",
                    status, status >= 400 ? "Fixture error" : "OK", headers, PublicMediaSource.stream(connection));
        } catch (Exception error) {
            return new WebResourceResponse("text/plain", "UTF-8", 503, "Fixture unavailable", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
        }
    }
    static String readText(AssetManager manager, String name) throws IOException {
        try (InputStream input = manager.open(name)) { return readText(input); }
    }
    private static String readText(InputStream input) throws IOException {
        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > 512 * 1024) throw new IOException("Manifest too large");
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
    @Override public void close() { loader.shutdownNow(); }
    private static final class LimitedStream extends FilterInputStream {
        private long remaining;
        LimitedStream(InputStream input, long remaining) { super(input); this.remaining = remaining; }
        @Override public int read() throws IOException {
            if (remaining == 0) return -1;
            int result = in.read(); if (result != -1) remaining--; return result;
        }
        @Override public int read(byte[] data, int offset, int length) throws IOException {
            if (length == 0) return 0;
            if (remaining == 0) return -1;
            int count = in.read(data, offset, (int) Math.min(length, remaining)); if (count > 0) remaining -= count; return count;
        }
    }
}
