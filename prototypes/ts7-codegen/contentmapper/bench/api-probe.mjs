// Finds the supported way to feed unsaved buffer text to a resident API program.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "typescript/unstable/sync";
import { createFileSystemLayer } from "typescript/unstable/fs";

const here = dirname(fileURLToPath(import.meta.url));
const configFile = join(here, "tsconfig.json");
const file = join(here, "src", "models", "m042.model.ts");
const original = readFileSync(file, "utf8");
const edited = original.replace('  label: string = "";', '  label: string = "";\n  deletedAt: Date;');

const sees = (snapshot, label) => {
  const project = snapshot.getProjects()[0];
  const sf = project.program.getSourceFile(file);
  const text = sf?.text ?? "";
  console.log(`${label.padEnd(46)} deletedAt=${/deletedAt/.test(text) ? "YES" : "no "}  len=${text.length}`);
};

for (const [label, build] of [
  ["update: fileSystem layer only", s => s.update({ fileSystem: createFileSystemLayer([[file, edited]]) })],
  ["update: layer + fileNotifications.changed", s => s.update({ fileSystem: createFileSystemLayer([[file, edited]]), fileNotifications: { changed: [file] } })],
  ["update: layer + ensurePrograms", s => s.update({ fileSystem: createFileSystemLayer([[file, edited]]), ensurePrograms: true })],
  ["update: layer + notif + ensurePrograms", s => s.update({ fileSystem: createFileSystemLayer([[file, edited]]), fileNotifications: { changed: [file] }, ensurePrograms: true })],
  ["update: layer + openFiles + ensurePrograms", s => s.update({ fileSystem: createFileSystemLayer([[file, edited]]), openFiles: [file], ensurePrograms: true })],
  ["update: invalidateAll + layer", s => s.update({ fileSystem: createFileSystemLayer([[file, edited]]), fileNotifications: { invalidateAll: true } })]
]) {
  const api = new API({ cwd: here });
  try {
    const base = api.createSnapshot({ openProjects: [configFile] });
    sees(base, "  base");
    const next = build(base);
    sees(next, label);
  } catch (error) {
    console.log(`${label.padEnd(46)} THREW ${String(error?.message ?? error).slice(0, 90)}`);
  } finally {
    api.close();
  }
}

// And the other direction: supply the layer at snapshot creation time.
{
  const api = new API({ cwd: here });
  try {
    const snap = api.createSnapshot({ openProjects: [configFile], fileSystem: createFileSystemLayer([[file, edited]]) });
    sees(snap, "createSnapshot: layer at open time");
  } catch (error) {
    console.log(`createSnapshot layer THREW ${String(error?.message ?? error).slice(0, 90)}`);
  } finally {
    api.close();
  }
}
