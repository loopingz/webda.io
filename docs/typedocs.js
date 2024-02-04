const { execSync } = require("child_process");
const fs = require("fs");

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
  .filter(i => !i.startsWith(".") && fs.existsSync(`../packages/${i}/src/index.ts`))
  .map(packageName => {
    cleanDir(`typedoc/${packageName}`);
    console.log(`Building typedoc for ${packageName}`);
    execSync(
      `yarn typedoc  --plugin typedoc-plugin-markdown --out typedoc/${packageName} --exclude "**/*+(index|.spec|.e2e).ts" --excludePrivate --hideInPageTOC --hideBreadcrumbs --tsconfig ../packages/${packageName}/tsconfig.json ../packages/${packageName}/src/index.ts`
    );
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
    fs.writeFileSync(`pages/Modules/${packageName}/README.md`, newReadme);
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
  let content = fs.readFileSync(file, "utf8").toString();
  content = content.replace(/\$\{/g, "$\\{");
  fs.writeFileSync(file, content);
});
