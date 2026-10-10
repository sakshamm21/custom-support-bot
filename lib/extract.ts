import { parse as parseHtml, HTMLElement } from "node-html-parser";
import Papa from "papaparse";

/** Convert HTML to readable text with markdown-ish headings; drops nav/footer/script noise. */
export function htmlToText(html: string): { title: string; text: string; links: string[] } {
  const root = parseHtml(html, { comment: false });
  const title = root.querySelector("title")?.text.trim() || root.querySelector("h1")?.text.trim() || "";
  const links = root.querySelectorAll("a[href]").map((a) => a.getAttribute("href") || "");
  root
    .querySelectorAll("script,style,noscript,svg,iframe,nav,footer,header,form,button,[aria-hidden=true]")
    .forEach((n) => n.remove());
  const main = root.querySelector("main") || root.querySelector("article") || root.querySelector("body") || root;
  const lines: string[] = [];
  walk(main as HTMLElement, lines);
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text, links };
}

const BLOCK = new Set(["p", "div", "section", "li", "tr", "br", "table", "ul", "ol", "dd", "dt", "blockquote", "pre"]);

function walk(node: HTMLElement, out: string[]) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const t = child.text.replace(/\s+/g, " ");
      if (t.trim()) out.push(out.length && !out[out.length - 1].endsWith("\n") ? (out.pop() + t) : t.trimStart());
      continue;
    }
    if (!(child instanceof HTMLElement)) continue;
    const tag = child.rawTagName?.toLowerCase();
    const h = tag?.match(/^h([1-6])$/);
    if (h) {
      out.push(`\n${"#".repeat(Number(h[1]))} ${child.text.trim()}\n`);
      continue;
    }
    if (tag === "li") out.push("\n- ");
    else if (tag && BLOCK.has(tag)) out.push("\n");
    walk(child, out);
    if (tag && BLOCK.has(tag)) out.push("\n");
  }
}

export function parseCsv(text: string): Record<string, unknown>[] {
  const res = Papa.parse<Record<string, unknown>>(text.trim(), { header: true, skipEmptyLines: true });
  return res.data;
}

export async function pdfToText(buf: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).map((t, i) => `## Page ${i + 1}\n\n${t}`).join("\n\n");
}

/** Block obviously internal hosts so the crawler can't be pointed at private infrastructure. */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal") return false;
    if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    if (h.startsWith("[") || h === "::1") return false;
    return true;
  } catch {
    return false;
  }
}
