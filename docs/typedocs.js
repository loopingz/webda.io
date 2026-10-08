const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repoUrl = "https://github.com/loopingz/webda.io/tree/main";
const readmeDir = fs.mkdtempSync(path.join(os.tmpdir(), "webda-typedoc-"));

/**
 * Copy a package README with its relative links turned into GitHub URLs.
 *
 * typedoc copies every relatively linked file into `_media`, and a link to a directory
 * (`](../core)`) copies the whole directory, node_modules included: hundreds of thousands
 * of files per package, which made the docs build run for hours.
 * @param {string} packageName - folder under ../packages
 * @returns {string|undefined} the rewritten README path, or undefined when the package has none
 */
function linkSafeReadme(packageName) {
  const source = `../packages/${packageName}/README.md`;
  if (!fs.existsSync(source)) return undefined;
  const base = `packages/${packageName}/`;
  const content = fs.readFileSync(source, "utf8").replace(/\]\((\.{1,2}\/[^)\s]*)\)/g, (_match, target) => {
    const resolved = path.posix.normalize(base + target);
    return `](${repoUrl}/${resolved})`;
  });
  const target = path.join(readmeDir, `${packageName}.md`);
  fs.writeFileSync(target, content);
  return target;
}

const headerMarkup = "\n<!-- README_HEADER -->\n";
const footerMarkup = "\n<!-- README_FOOTER -->\n";

// Clean dir
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    console.log(`Cleaning ${dir}`);
    fs.rmSync(dir, {
      recursive: true,
      force: true
    });
  }
}

fs.readdirSync("../packages")
  .filter(
    i =>
      !i.startsWith(".") &&
      fs.existsSync(`../packages/${i}/src/index.ts`) &&
      fs.existsSync(`../packages/${i}/node_modules`)
  )
  .map(packageName => {
    cleanDir(`typedoc/${packageName}`);
    console.log(`Building typedoc for ${packageName}`);
    try {
      const readme = linkSafeReadme(packageName);
      execSync(
        `pnpm exec typedoc  --plugin typedoc-plugin-markdown --out typedoc/${packageName} --exclude "**/*+(index|.spec|.e2e).ts" --excludePrivate --hideBreadcrumbs${readme ? ` --readme ${readme}` : ""} --tsconfig ../packages/${packageName}/tsconfig.json ../packages/${packageName}/src/index.ts`,
        { stdio: "inherit" }
      );
    } catch (e) {
      console.warn(`Skipping ${packageName}: typedoc build failed`);
      return;
    }
    if (!fs.existsSync(`typedoc/${packageName}/README.md`)) {
      console.warn(`Skipping ${packageName}: no README.md produced`);
      return;
    }
    if (fs.existsSync(`../packages/${packageName}/CHANGELOG.md`)) {
      console.log(`Copying CHANGELOG for ${packageName}`);
      fs.copyFileSync(`../packages/${packageName}/CHANGELOG.md`, `typedoc/${packageName}/CHANGELOG.md`);
    }
    // Remove header and footer from the README
    let newReadme = fs.readFileSync(`typedoc/${packageName}/README.md`, "utf8").toString();
    if (newReadme.includes(headerMarkup)) {
      newReadme = newReadme.substring(newReadme.indexOf(headerMarkup) + headerMarkup.length);
    }
    if (newReadme.includes(footerMarkup)) {
      newReadme = newReadme.substring(0, newReadme.indexOf(footerMarkup));
    }
    newReadme = `---\nsidebar_label: "@webda/${packageName}"\n---\n# ${packageName}\n${newReadme}`;

    fs.mkdirSync(`pages/Modules/${packageName}`, { recursive: true });
    // Without a package README, typedoc's README is its index, whose links are relative to the typedoc
    // section: point them at the typedoc routes so the copy in pages/Modules does not break the build
    const pageReadme = newReadme.replace(
      /\]\((?![a-z]+:|#|\/)([^)\s]+?)\.md(#[^)\s]*)?\)/g,
      (_match, target, anchor) => `](/typedoc/${packageName}/${target}${anchor ?? ""})`
    );
    fs.writeFileSync(`pages/Modules/${packageName}/README.md`, pageReadme);
    // Add globals to the README
    if (fs.existsSync(`typedoc/${packageName}/globals.md`)) {
      const globals = fs.readFileSync(`typedoc/${packageName}/globals.md`, "utf8").toString();
      newReadme += `\n\n${globals.split("\n").slice(6).join("\n")}`;
      // console.log("Removed globals.md for", packageName);
      //fs.unlinkSync(`typedoc/${packageName}/globals.md`);
    }

    console.log("Updating README for", packageName);
    fs.writeFileSync(`typedoc/${packageName}/README.md`, newReadme);
  });

// Need to replace ${ in all files but for now handle a case by case
["typedoc/core/interfaces/KeysRegistry.md"].forEach(file => {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, "utf8").toString();
  content = content.replace(/\$\{/g, "$\\{");
  fs.writeFileSync(file, content);
});
