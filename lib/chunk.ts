// Text chunking. Pure functions, no imports, so they're easy to test.

export function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split text into ~maxChars chunks, preferring paragraph, then sentence boundaries,
 * with a small overlap so answers that straddle a boundary are still retrievable.
 * Headings (markdown "#" lines) are carried into each chunk they cover as context.
 */
export function chunkText(raw: string, maxChars = 1200, overlap = 150): string[] {
  const text = normalize(raw);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/);
  const pieces: { heading: string; text: string }[] = [];
  let heading = "";
  for (const p of paragraphs) {
    const h = p.match(/^#{1,6}\s+(.+)$/m);
    if (h && p.trim().startsWith("#")) heading = h[1].trim();
    if (p.length <= maxChars) {
      pieces.push({ heading, text: p });
    } else {
      for (const s of splitLong(p, maxChars)) pieces.push({ heading, text: s });
    }
  }

  const chunks: string[] = [];
  let current = "";
  let currentHeading = "";
  const flush = () => {
    if (!current.trim()) return;
    const prefix = currentHeading && !current.startsWith("#") ? `[${currentHeading}]\n` : "";
    chunks.push((prefix + current).trim());
  };
  for (const piece of pieces) {
    if (current && current.length + piece.text.length + 2 > maxChars) {
      flush();
      const tail = current.slice(-overlap);
      const cut = tail.search(/[.!?\n]\s/);
      current = (cut >= 0 ? tail.slice(cut + 2) : "") + (cut >= 0 ? "\n\n" : "");
      currentHeading = piece.heading;
    }
    if (!current) currentHeading = piece.heading;
    current += (current && !current.endsWith("\n\n") ? "\n\n" : "") + piece.text;
  }
  flush();
  return chunks;
}

function splitLong(p: string, maxChars: number): string[] {
  const sentences = p.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [p];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length > maxChars && buf) {
      out.push(buf.trim());
      buf = "";
    }
    if (s.length > maxChars) {
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars).trim());
    } else {
      buf += s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/** Turn CSV rows into self-describing text records ("Column: value; ...") grouped into chunks. */
export function rowsToChunks(rows: Record<string, unknown>[], title: string, rowsPerChunk = 8): string[] {
  const lines = rows
    .map((r) =>
      Object.entries(r)
        .filter(([k, v]) => k && v !== null && v !== undefined && String(v).trim() !== "")
        .map(([k, v]) => `${k.trim()}: ${String(v).trim()}`)
        .join("; ")
    )
    .filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += rowsPerChunk) {
    chunks.push(`[${title}]\n` + lines.slice(i, i + rowsPerChunk).map((l) => `- ${l}`).join("\n"));
  }
  return chunks;
}
