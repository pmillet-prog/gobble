package fr.gobble.hybrid;

import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

public final class MediaCacheTest {
    static MediaCache.Entry entry(String path, byte[] bytes) throws Exception {
        return new MediaCache.Entry(path, MediaCache.digest(new ByteArrayInputStream(bytes)), "image/png", bytes.length);
    }
    static void check(boolean value, String label) { if (!value) throw new AssertionError(label); }
    static byte[] read(MediaCache.Result result) throws Exception { try (InputStream input = result.stream) { return input.readAllBytes(); } }
    public static void main(String[] args) throws Exception {
        File directory = new File(args[0]);
        byte[] first = "first image".getBytes(), second = "replacement image".getBytes();
        MediaCache.Entry old = entry("/image.png", first), next = entry("/image.png", second);
        AtomicInteger requests = new AtomicInteger();
        MediaCache.Source network = path -> { requests.incrementAndGet(); return new ByteArrayInputStream(second); };
        MediaCache cache = new MediaCache(directory, Map.of(old.path, old), path -> new ByteArrayInputStream(first), network);
        MediaCache.Result seeded = cache.open(old);
        check(seeded.source.equals("bundled") && Arrays.equals(read(seeded), first) && requests.get() == 0, "unchanged media is local");
        MediaCache.Result changed = cache.open(next);
        check(changed.source.equals("download") && Arrays.equals(read(changed), second), "same URL, new hash downloads current media");
        check(Arrays.equals(read(cache.open(next)), second) && requests.get() == 1, "replacement is reused without a request");
        MediaCache restarted = new MediaCache(directory, Map.of(), null, network);
        check(Arrays.equals(read(restarted.open(next)), second) && requests.get() == 1, "disk cache survives activity/process restart");
        Files.write(new File(directory, next.hash + ".blob").toPath(), new byte[second.length]);
        restarted = new MediaCache(directory, Map.of(), null, network);
        check(Arrays.equals(read(restarted.open(next)), second) && requests.get() == 2, "corrupted disk file is repaired");
        MediaCache.Entry mismatch = entry("/broken.png", "expected image".getBytes());
        try { cache.open(mismatch); throw new AssertionError("bad digest accepted"); } catch (IOException expected) { }
        check(!new File(directory, mismatch.hash + ".blob").exists(), "unverified download never becomes reusable");
        check(Arrays.stream(Objects.requireNonNull(directory.list())).noneMatch(name -> name.endsWith(".part")), "failed download is removed");
        for (String path : List.of("/", "/index.html", "/assets/app.js", "/assets/main.css", "/catalog.json", "/api/avatar.png", "/socket.io/pic.png", "/../image.png", "//host/image.png", "/image.png?v=2")) {
            check(!MediaCache.isMediaPath(path), "code or private path must use the web: " + path);
        }
        ExecutorService executor = Executors.newFixedThreadPool(3);
        try {
            MediaCache concurrent = new MediaCache(new File(directory, "parallel"), Map.of(), null, network);
            int before = requests.get();
            List<Future<byte[]>> jobs = new ArrayList<>();
            for (int i = 0; i < 3; i++) jobs.add(executor.submit(() -> read(concurrent.open(next))));
            for (Future<byte[]> job : jobs) check(Arrays.equals(job.get(), second), "parallel readers get the complete file");
            check(requests.get() == before + 1, "parallel requests share one download");
        } finally { executor.shutdownNow(); }
        File bounded = new File(directory, "bounded");
        MediaCache limited = new MediaCache(bounded, Map.of(), null, path -> new ByteArrayInputStream(large(path.charAt(1))));
        for (char c : new char[] {'a','b','c'}) read(limited.open(entry("/" + c + ".png", large(c))));
        long total = Arrays.stream(Objects.requireNonNull(bounded.listFiles())).mapToLong(File::length).sum();
        check(total <= MediaCache.MAX_CACHE_BYTES, "media disk storage remains bounded");
        System.out.println("Media cache verified: seeds, web replacements, persistent reuse, integrity, rejected paths, concurrency, disk limit.");
    }
    static byte[] large(char value) { byte[] bytes = new byte[24 * 1024 * 1024]; Arrays.fill(bytes, (byte) value); return bytes; }
}
