// Run with `pnpm test` (node --test): the managed video blocks rendered as embeds.
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { createRequire } = require("module");
const { pathToFileURL } = require("url");
const remarkVideoEmbeds = require("../src/plugins/video-embeds");
const { findBlocks } = remarkVideoEmbeds;

const THUMBNAIL =
  "[![Webda and GraphQL](https://i.ytimg.com/vi/AbCdEfGhIjK/hqdefault.jpg)](https://www.youtube.com/watch?v=AbCdEfGhIjK)";
const LINKS =
  "[Version française](https://www.youtube.com/watch?v=ZyXwVuTsRqP) · [Slides (PDF)](https://webda.io/presentations/webda-graphql/webda-graphql.pdf)";

/**
 * A managed block, as the bot writes it.
 *
 * @param {object} [options] block parts
 * @param {string} [options.open] start marker
 * @param {string} [options.close] end marker
 * @param {string} [options.thumbnail] thumbnail line
 * @returns {string} the block
 */
const block = ({
  open = "<!-- webda-video:webda-graphql -->",
  close = "<!-- /webda-video -->",
  thumbnail = THUMBNAIL
} = {}) => [open, thumbnail, "", LINKS, close].join("\n");

const page = body => `# GraphQL\n\n${body}\n\nAfter\n`;

// The MDX compiler and comment plugin of the installed Docusaurus, resolved through its mdx-loader
const loaderRequire = (() => {
  const docs = createRequire(path.join(__dirname, "..", "package.json"));
  const core = createRequire(docs.resolve("@docusaurus/core/package.json"));
  return createRequire(core.resolve("@docusaurus/mdx-loader/package.json"));
})();
const load = name => import(pathToFileURL(loaderRequire.resolve(name)).href);

/**
 * Compiles a page with the plugin, the way Docusaurus does.
 *
 * @param {string} source page source
 * @param {"md"|"mdx"} format page format
 * @param {boolean} [docusaurusComments] use Docusaurus' comment parsing (drops `<!-- -->` from the tree)
 * @returns {Promise<string>} the compiled JSX module
 */
async function compile(source, format, docusaurusComments = true) {
  const mdx = await load("@mdx-js/mdx");
  const remarkPlugins = [remarkVideoEmbeds];
  if (docusaurusComments) remarkPlugins.unshift((await load("@slorber/remark-comment")).default);
  const rehypePlugins = [];
  if (format === "md") {
    const rehypeRaw = (await load("rehype-raw")).default;
    rehypePlugins.push([rehypeRaw, { passThrough: ["mdxFlowExpression", "mdxJsxFlowElement", "mdxJsxTextElement"] }]);
  }
  return String(await mdx.compile(source, { format, remarkPlugins, rehypePlugins }));
}

/**
 * Checks a compiled page holds the embed and the links line, and no thumbnail or marker.
 *
 * @param {string} output compiled page
 */
function assertEmbed(output) {
  assert.match(output, /src: "https:\/\/www\.youtube-nocookie\.com\/embed\/AbCdEfGhIjK"/);
  assert.match(output, /title: "Webda and GraphQL"/);
  assert.match(output, /allow: "accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"/);
  assert.match(output, /allowFullScreen: true/);
  assert.match(output, /loading: "lazy"/);
  assert.match(output, /className: "webda-video"/);
  assert.match(output, /"https:\/\/www\.youtube\.com\/watch\?v=ZyXwVuTsRqP"/);
  assert.match(output, /"https:\/\/webda\.io\/presentations\/webda-graphql\/webda-graphql\.pdf"/);
  assert.doesNotMatch(output, /i\.ytimg\.com/);
  assert.doesNotMatch(output, /webda-video:/);
  assert.match(output, /After/);
}

test("findBlocks locates closed blocks only", () => {
  const source = page(block());
  const [found, ...rest] = findBlocks(source);
  assert.strictEqual(rest.length, 0);
  assert.strictEqual(found.deck, "webda-graphql");
  assert.strictEqual(source.slice(found.start, found.end), block());
  assert.deepStrictEqual(findBlocks(page(block({ close: "" }))), []);
  assert.strictEqual(
    findBlocks(block({ open: "{/* webda-video:webda-graphql */}", close: "{/* /webda-video */}" }))[0].deck,
    "webda-graphql"
  );
});

test("a .md page renders the embed, with Docusaurus' comment parsing", async () => {
  assertEmbed(await compile(page(block()), "md"));
});

test("a .md page renders the embed, with comments kept as HTML nodes", async () => {
  assertEmbed(await compile(page(block()), "md", false));
});

test("a .mdx page renders the embed, with <!-- --> or {/* */} markers", async () => {
  assertEmbed(await compile(page(block()), "mdx"));
  assertEmbed(
    await compile(page(block({ open: "{/* webda-video:webda-graphql */}", close: "{/* /webda-video */}" })), "mdx")
  );
});

test("a block nested in a list is rewritten too", async () => {
  const nested = block()
    .split("\n")
    .map(line => (line ? `  ${line}` : line))
    .join("\n");
  assertEmbed(await compile(page(`- Item\n\n${nested}`), "md"));
});

test("blocks without an end marker or a YouTube thumbnail are left alone", async () => {
  const unclosed = await compile(page(block({ close: "" })), "md");
  assert.match(unclosed, /i\.ytimg\.com/);
  assert.doesNotMatch(unclosed, /youtube-nocookie/);

  const other = await compile(
    page(block({ thumbnail: "[![Other](https://example.com/a.jpg)](https://example.com/v)" })),
    "md"
  );
  assert.match(other, /example\.com\/a\.jpg/);
  assert.doesNotMatch(other, /youtube-nocookie/);
});

test("a block shown in a code fence stays code", async () => {
  const output = await compile(page("```md\n" + block() + "\n```"), "md");
  assert.match(output, /i\.ytimg\.com/);
  assert.doesNotMatch(output, /youtube-nocookie/);
});
