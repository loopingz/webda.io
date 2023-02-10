import { FileUtils } from "@webda/core";
import { existsSync, readFileSync } from "fs";
import { basename, dirname } from "path";

const pages = [];
const parents = {};

FileUtils.find("docs/pages", file => {
  if (!file.endsWith(".md")) {
    return;
  }
  let rel = file.substring("docs/pages/".length);
  let toAdd = pages;
  if (rel.includes("/")) {
  }
  let title = readFileSync(file)
    .toString()
    .match(/# (.*)/);
  title = title !== null ? title[1] : basename(file).substring(0, basename(file).length - 3);
  // This page is a parent of another
  let parentId = file.substring(0, file.length - 3);
  let page = {
    title: title,
    source: file
  };
  if (existsSync(parentId)) {
    page.children = [];
    page.childrenDir = "./" + parentId;
    parents[parentId] = page;
  }
  pages.push(page);
});

const finalPages = [];

let parentsIds = Object.keys(parents).sort((a, b) => a.localeCompare(b) * -1);
for (let page of pages) {
  if (!page.source.substring("docs/pages/".length).includes("/")) {
    finalPages.push(page);
    continue;
  }
  let parent = dirname(page.source);
  while (true) {
    const id = parentsIds.find(p => p === parent);
    if (id) {
      page.source = page.source.substring(id.length + 1);
      if (page.childrenDir) {
        page.childrenDir = page.childrenDir.substring(id.length + 3);
      }
      parents[id].children.push(page);
      break;
    }
    parent = dirname(parent);
    if (parent.endsWith("docs/pages")) {
      page.source = "./" + page.source;
      finalPages.push(page);
      break;
    }
  }
}

finalPages.forEach(p => {
  p.source = "./" + p.source;
});

const typedoc = FileUtils.load("./typedoc.json");
typedoc.pluginPages.pages = finalPages;
FileUtils.save(typedoc, "./typedoc.json");
