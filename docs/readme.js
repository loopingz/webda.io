const fs = require("fs");

const header = fs.readFileSync("README.header.md", "utf8");
const footer = fs.readFileSync("README.footer.md", "utf8");

function updateReadme(content, package) {
  const newHeader = header.replace(/{{name}}/g, package.name).replace(/{{description}}/g, package.description);
  const newFooter = footer.replace(/{{name}}/g, package.name);
  const headerMarkup = "\n<!-- README_HEADER -->\n";
  const footerMarkup = "\n<!-- README_FOOTER -->\n";
  const headerPos = content.indexOf(headerMarkup);
  if (headerPos !== -1) {
    content = content.substring(headerPos + headerMarkup.length);
  }
  // Remove title if exists
  if (content.startsWith(`# ${package.name}\n`)) {
    content = content.substring(package.name.length + 3);
  }
  const footerPos = content.indexOf(footerMarkup);
  if (footerPos !== -1) {
    content = content.substring(0, footerPos);
  }
  return `${newHeader}${headerMarkup}${content}${footerMarkup}${newFooter}`;
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
