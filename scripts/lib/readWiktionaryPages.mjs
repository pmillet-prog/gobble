import { createReadStream } from "node:fs";
import { extractPage } from "../build-wiktionary-definitions.mjs";

export async function* readWiktionaryPages(dumpPath) {
  const input = createReadStream(dumpPath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  let buffer = "";
  for await (const chunk of input) {
    buffer += chunk;
    while (true) {
      const start = buffer.indexOf("<page>");
      if (start < 0) {
        buffer = buffer.slice(-16);
        break;
      }
      if (start > 0) buffer = buffer.slice(start);
      const end = buffer.indexOf("</page>");
      if (end < 0) break;
      yield extractPage(buffer.slice(0, end + 7));
      buffer = buffer.slice(end + 7);
    }
  }
  if (buffer.includes("<page>")) throw new Error("Dump XML interrompu au milieu d’une page.");
  if (!buffer.includes("</mediawiki>")) throw new Error("Dump XML incomplet : fermeture mediawiki manquante.");
}
