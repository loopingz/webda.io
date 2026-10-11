const fs = require("fs");

const header = fs.readFileSync("README.header.md", "utf8");
const footer = fs.readFileSync("README.footer.md", "utf8");

function updateReadme(content, package) {
  const newHeader = header.replace(/{{name}}/g, package.name).replace(/{{description}}/g, package.description);
  const newFooter = footer.replace(/{{name}}/g, package.name);
  // Markers are matched with any surrounding blank lines, so the output stays stable after prettier
  const headerMatch = content.match(/\n*<!-- README_HEADER -->\n*/);
  if (headerMatch) {
    content = content.substring(headerMatch.index + headerMatch[0].length);
  }
  // Remove title if exists
  if (content.startsWith(`# ${package.name}\n`)) {
    content = content.substring(package.name.length + 3).replace(/^\n+/, "");
  }
  const footerMatch = content.match(/\n*<!-- README_FOOTER -->\n*/);
  if (footerMatch) {
    content = content.substring(0, footerMatch.index);
  }
  content = content.replace(/\s+$/, "");
  return `${newHeader}\n<!-- README_HEADER -->\n\n${content}\n\n<!-- README_FOOTER -->\n\n${newFooter}`;
}

function handleReadme(packagePath) {
  const package = require(`${packagePath}/package.json`);
  let readme = "";
  if (fs.existsSync(`${packagePath}/README.md`)) {
    readme = fs.readFileSync(`${packagePath}/README.md`, "utf8").toString();
  }
  const newReadme = updateReadme(readme, package);
  if (readme !== newReadme) {
    console.log(`Updating ${packagePath}/README.md`);
    fs.writeFileSync(`${packagePath}/README.md`, newReadme);
  }
}

fs.readdirSync("../packages")
  .filter(i => !i.startsWith(".") && fs.existsSync(`../packages/${i}/src/index.ts`))
  .map(packageName => {
    handleReadme(`../packages/${packageName}`);
  });
handleReadme(`..`);
