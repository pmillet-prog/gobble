export const CHALKBOARD_TEXTURE_URL = "/chalkboard/surface/patinee-v2.webp";

export async function loadChalkboardTexture({ signal, fetchImage = fetch, makeImage = () => new Image(), urls = URL } = {}) {
  // Explicit loading lets us retry/decode failures that a CSS background hides.
  // Reload also bypasses an obsolete HTTP entry; the service worker validates
  // this particular image before serving or caching it.
  const response = await fetchImage(CHALKBOARD_TEXTURE_URL, { signal, cache: "reload" });
  if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) throw new Error("chalkboard_texture_unavailable");
  const blob = await response.blob();
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const src = urls.createObjectURL(blob);
  try {
    const image = makeImage();
    image.src = src;
    await image.decode();
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return { src, release: () => urls.revokeObjectURL(src) };
  } catch (error) {
    urls.revokeObjectURL(src);
    throw error;
  }
}
