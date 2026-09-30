package fr.gobble.hybrid;

import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/** Content-addressed, bounded store. Only verified public media enters it. */
final class MediaCache {
    static final long MAX_FILE_BYTES = 32L * 1024 * 1024;
    static final long MAX_CACHE_BYTES = 64L * 1024 * 1024;
    interface Source { InputStream open(String path) throws IOException; }
    static final class Entry {
        final String path, hash, mime;
        final long bytes;
        Entry(String path, String hash, String mime, long bytes) {
            if (!isMediaPath(path) || !hash.matches("[a-f0-9]{64}") || bytes <= 0 || bytes > MAX_FILE_BYTES)
                throw new IllegalArgumentException("Invalid public media entry");
            this.path = path; this.hash = hash; this.mime = mime; this.bytes = bytes;
        }
    }
    static boolean isMediaPath(String path) {
        return path != null && path.startsWith("/") && !path.startsWith("//")
                && !path.contains("..") && !path.contains("\\") && !path.contains("?") && !path.contains("#")
                && !path.startsWith("/api/") && !path.startsWith("/socket.io/")
                && (path.equals("/dico.txt") || path.matches("(?i)^/[^\\r\\n]+\\.(png|webp|gif|svg|ttf|otf|woff2?|wav|mp3)$"));
    }
    static final class Result {
        final InputStream stream;
        final String source;
        Result(InputStream stream, String source) { this.stream = stream; this.source = source; }
    }
    private final File directory;
    private final Map<String, Entry> seeds;
    private final Source seed, remote;
    private final Set<String> verified = ConcurrentHashMap.newKeySet();
    private final Object[] locks = new Object[16];
    final AtomicLong downloadedBytes = new AtomicLong();

    MediaCache(File directory, Map<String, Entry> seeds, Source seed, Source remote) throws IOException {
        this.directory = directory; this.seeds = seeds; this.seed = seed; this.remote = remote;
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Media cache unavailable");
        Arrays.setAll(locks, index -> new Object());
    }

    Result open(Entry entry) throws IOException {
        Entry packaged = seeds.get(entry.path);
        if (packaged != null && packaged.hash.equals(entry.hash) && packaged.bytes == entry.bytes)
            return new Result(seed.open(entry.path), "bundled");
        synchronized (locks[(entry.hash.hashCode() & Integer.MAX_VALUE) % locks.length]) {
            File file = new File(directory, entry.hash + ".blob");
            if (file.isFile() && file.length() == entry.bytes) {
                if (!verified.contains(entry.hash)) {
                    try (InputStream input = new FileInputStream(file)) {
                        if (digest(input).equals(entry.hash)) verified.add(entry.hash);
                    }
                }
                if (verified.contains(entry.hash)) {
                    InputStream input = new FileInputStream(file);
                    file.setLastModified(System.currentTimeMillis());
                    return new Result(input, "cache");
                }
            }
            verified.remove(entry.hash);
            File partial = File.createTempFile("media-", ".part", directory);
            try {
                MessageDigest digest = sha256();
                long count = 0;
                try (InputStream input = remote.open(entry.path); OutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[16384]; int size;
                    while ((size = input.read(buffer)) != -1) {
                        count += size;
                        if (count > entry.bytes) throw new IOException("Oversized media");
                        digest.update(buffer, 0, size); output.write(buffer, 0, size);
                    }
                }
                if (count != entry.bytes || !hex(digest.digest()).equals(entry.hash)) throw new IOException("Media integrity mismatch");
                if (file.exists() && !file.delete()) throw new IOException("Cannot replace invalid media");
                if (!partial.renameTo(file)) throw new IOException("Cannot commit media");
                verified.add(entry.hash); downloadedBytes.addAndGet(count);
                InputStream input = new FileInputStream(file);
                trim(file);
                return new Result(input, "download");
            } finally { if (partial.exists()) partial.delete(); }
        }
    }

    private synchronized void trim(File keep) {
        File[] files = directory.listFiles((dir, name) -> name.matches("[a-f0-9]{64}\\.blob"));
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        long total = 0;
        for (File file : files) total += file.length();
        for (File file : files) {
            if (total <= MAX_CACHE_BYTES) break;
            if (file.equals(keep)) continue;
            long bytes = file.length();
            if (file.delete()) { total -= bytes; verified.remove(file.getName().substring(0, 64)); }
        }
    }
    private static MessageDigest sha256() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (Exception error) { throw new IllegalStateException(error); }
    }
    static String digest(InputStream input) throws IOException {
        MessageDigest digest = sha256(); byte[] buffer = new byte[16384]; int size;
        while ((size = input.read(buffer)) != -1) digest.update(buffer, 0, size);
        return hex(digest.digest());
    }
    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder();
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
}
