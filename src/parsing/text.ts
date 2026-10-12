import { parseDocument } from "htmlparser2";
import { hasChildren, isTag, isText, type AnyNode, type Element } from "domhandler";

const excludedElements = new Set(["script", "style", "template", "noscript", "nav", "header", "footer", "aside"]);

export function* htmlElements(root: AnyNode, options: { excludeNonContent?: boolean } = {}): Generator<Element> {
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (options.excludeNonContent && isTag(node) && excludedElements.has(node.name)) continue;
    if (isTag(node)) yield node;
    if (!hasChildren(node)) continue;
    for (let index = node.children.length - 1; index >= 0; index--) stack.push(node.children[index]!);
  }
}

// Text extraction is not HTML sanitization. Parse once, discard active/site
// elements, then escape at the Markdown boundary without decoding a second time.
export function htmlToText(source: string, options: { xmlMode?: boolean } = {}): string {
  return nodeToText(parseDocument(source, { ...options, decodeEntities: true }));
}

export function nodeToText(root: AnyNode): string {
  const parts: string[] = [];
  const stack = [{ node: root, closing: false }];
  while (stack.length) {
    const { node, closing } = stack.pop()!;
    if (isText(node)) {
      parts.push(node.data);
      continue;
    }
    if (isTag(node) && excludedElements.has(node.name)) continue;
    const block = isTag(node) && ["p", "div", "section", "article", "main", "li", "tr", "h1", "h2", "h3", "h4", "w:p"].includes(node.name);
    if (block || (isTag(node) && ["br", "w:br"].includes(node.name))) parts.push("\n\n");
    if (closing || !hasChildren(node)) continue;
    if (block) stack.push({ node, closing: true });
    for (let index = node.children.length - 1; index >= 0; index--) stack.push({ node: node.children[index]!, closing: false });
  }
  return parts.join("").replace(/[\t\r\u00a0 ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Preserve literal source characters visibly without allowing raw HTML, links,
// images or inline Markdown formatting to become active in resource output.
export function escapeMarkdownText(text: string): string {
  return text.replace(/[&<>\\`*_[\]#|:@]/g, character =>
    character === "&" ? "&amp;" : character === "<" ? "&lt;" : character === ">" ? "&gt;" : `\\${character}`)
    .replace(/\bwww\./gi, match => `${match.slice(0, -1)}\\.`);
}

export function markdownDestination(url: string): string {
  return url.replace(/[()\\<>\s]/g, character => character === "(" ? "%28" : character === ")" ? "%29" : encodeURIComponent(character));
}
