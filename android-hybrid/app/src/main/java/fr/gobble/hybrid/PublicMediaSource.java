package fr.gobble.hybrid;

import java.io.*;
import java.net.*;

/** No account cookies or credentials: this connection only reads public files. */
final class PublicMediaSource implements MediaCache.Source {
    private final String origin;
    PublicMediaSource(String origin) { this.origin = origin; }
    @Override public InputStream open(String path) throws IOException {
        HttpURLConnection connection = connect(path);
        try {
            if (connection.getResponseCode() != 200) throw new IOException("Public media unavailable");
            return stream(connection);
        } catch (IOException error) { connection.disconnect(); throw error; }
    }
    HttpURLConnection connect(String path) throws IOException {
        try {
            URL url = new URL(origin + new URI(null, null, path, null).toASCIIString());
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(3000); connection.setReadTimeout(5000);
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");
            connection.setRequestProperty("Accept-Encoding", "identity");
            return connection;
        } catch (URISyntaxException error) { throw new IOException(error); }
    }
    static InputStream stream(HttpURLConnection connection) throws IOException {
        InputStream body;
        try { body = connection.getInputStream(); }
        catch (IOException error) {
            body = connection.getErrorStream();
            if (body == null) { connection.disconnect(); throw error; }
        }
        return new FilterInputStream(body) {
            @Override public void close() throws IOException { try { super.close(); } finally { connection.disconnect(); } }
        };
    }
}
