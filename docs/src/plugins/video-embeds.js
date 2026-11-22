/**
 * Remark plugin: renders the managed video blocks of the documentation as
 * privacy-enhanced YouTube embeds.
 *
 * A managed block is written in plain Markdown, so it stays a thumbnail link on
 * GitHub and npm:
 *
 * ```md
 * <!-- webda-video:<deck> -->
 * [![<title>](https://i.ytimg.com/vi/<id>/hqdefault.jpg)](https://www.youtube.com/watch?v=<id>)
 *
 * [Version française](https://www.youtube.com/watch?v=<fr>) · [Slides (PDF)](https://webda.io/presentations/<deck>/<deck>.pdf)
 * <!-- /webda-video -->
 * ```
 *
 * On the site, the thumbnail paragraph becomes a 16:9 `<iframe>` on
 * youtube-nocookie.com (no cookie before playback) and every other paragraph of
 * the block (the links line) is kept as is. The embed is built as hast data on
 * an mdast node, not as raw HTML, so it renders the same in `.md` (CommonMark)
 * and `.mdx` pages.
 */

// Markers as written in the source: `<!-- -->` in `.md`, `{/* */}` in `.mdx`
const START = /(?:<!--|\{\/\*)\s*webda-video:([\w.-]+)\s*(?:-->|\*\/\})/g;
const END = /(?:<!--|\{\/\*)\s*\/webda-video\s*(?:-->|\*\/\})/g;
// A marker node, when the parser keeps comments in the tree (plain MDX: html or expression nodes)
const MARKER = /^\s*(?:<!--|\/\*)\s*\/?webda-video(?::[\w.-]+)?\s*(?:-->|\*\/)\s*$/;
const WATCH = /^https:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]+)(?:&.*)?$/;
const ALLOW = "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture";

/**
 * Finds the managed blocks in a page source.
 *
 * Docusaurus drops HTML comments while parsing (remark-comment, without AST
 * nodes), so the markers are located in the source and the nodes between them
 * by their positions.
 *
 * @param {string} source page source, as parsed
 * @returns {{deck: string, start: number, end: number}[]} the blocks, as source offsets
 */
function findBlocks(source) {
  const blocks = [];
  for (const open of source.matchAll(START)) {
    END.lastIndex = open.index + open[0].length;
    const close = END.exec(source);
    if (!close) continue;
    const next = source.slice(open.index + open[0].length, close.index).search(START);
    if (next !== -1) continue;
    blocks.push({ deck: open[1], start: open.index, end: close.index + close[0].length });
  }
  return blocks;
}

/**
 * Finds the YouTube thumbnail link of a paragraph: `[![title](thumbnail)](watch url)`.
 *
 * @param {any} node mdast node
 * @returns {{id: string, title: string}|undefined} the video, if the paragraph is its thumbnail link
 */
function thumbnailVideo(node) {
  if (node?.type !== "paragraph") return undefined;
  const children = node.children.filter(child => !(child.type === "text" && child.value.trim() === ""));
  if (children.length !== 1 || children[0].type !== "link") return undefined;
  const link = children[0];
  const match = WATCH.exec(link.url);
  const image = link.children.find(child => child.type === "image");
  if (!match || !image) return undefined;
  return { id: match[1], title: image.alt || link.title || "Video" };
}

/**
 * Builds the embed node: a `div.webda-video` wrapper (16:9, see custom.css) holding the iframe.
 *
 * @param {{id: string, title: string}} video the video to embed
 * @param {string} deck the deck id of the block
 * @returns {any} an mdast node carrying its hast rendering
 */
function embedNode(video, deck) {
  return {
    type: "webdaVideo",
    data: {
      hName: "div",
      hProperties: { className: ["webda-video"], dataDeck: deck },
      hChildren: [
        {
          type: "element",
          tagName: "iframe",
          properties: {
            src: `https://www.youtube-nocookie.com/embed/${video.id}`,
            title: video.title,
            allow: ALLOW,
            allowFullScreen: true,
            loading: "lazy",
            referrerPolicy: "strict-origin-when-cross-origin"
          },
          children: []
        }
      ]
    }
  };
}

/**
 * Rewrites one block: in the parent whose children lie between its markers,
 * the thumbnail paragraph becomes the embed and the marker nodes go away.
 *
 * @param {any} tree mdast root
 * @param {{deck: string, start: number, end: number}} block the block
 * @returns {boolean} whether the block was rewritten
 */
function rewriteBlock(tree, block) {
  const inside = node => node.position?.start?.offset >= block.start && node.position?.end?.offset <= block.end;
  const visit = parent => {
    if (!Array.isArray(parent.children)) return false;
    const indexes = parent.children.flatMap((node, index) => (inside(node) ? [index] : []));
    const thumbnail = indexes.find(index => thumbnailVideo(parent.children[index]));
    if (thumbnail !== undefined) {
      const first = indexes[0];
      const last = indexes[indexes.length - 1];
      const replacement = parent.children.slice(first, last + 1).flatMap((node, offset) => {
        if (first + offset === thumbnail) return [embedNode(thumbnailVideo(node), block.deck)];
        return typeof node.value === "string" && MARKER.test(node.value) ? [] : [node];
      });
      parent.children.splice(first, last - first + 1, ...replacement);
      return true;
    }
    return parent.children.some(visit);
  };
  return visit(tree);
}

/**
 * Rewrites every managed block of a page.
 *
 * @param {any} tree mdast root, with positions
 * @param {string} source the source it was parsed from
 * @returns {number} the number of blocks rewritten
 */
function rewriteVideoBlocks(tree, source) {
  return findBlocks(source).filter(block => rewriteBlock(tree, block)).length;
}

/**
 * The remark plugin, for `remarkPlugins` of a docs plugin instance.
 *
 * @returns {(tree: any, file: {value: unknown}) => void} the transformer
 */
function remarkVideoEmbeds() {
  return (tree, file) => {
    rewriteVideoBlocks(tree, String(file.value));
  };
}

module.exports = remarkVideoEmbeds;
module.exports.rewriteVideoBlocks = rewriteVideoBlocks;
module.exports.findBlocks = findBlocks;
