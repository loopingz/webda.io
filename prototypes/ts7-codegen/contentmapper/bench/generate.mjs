// Generates a bench project sized like a real Webda package.
// Each model exercises all three coercion kinds plus cross-file relations,
// so the checker actually has to resolve something on every transform.
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const count = Number(process.argv[2] ?? 100);
const modelsDir = join(here, "src", "models");

rmSync(modelsDir, { recursive: true, force: true });
mkdirSync(modelsDir, { recursive: true });

for (let i = 0; i < count; i++) {
  const n = String(i).padStart(3, "0");
  const next = String((i + 1) % count).padStart(3, "0");
  writeFileSync(
    join(modelsDir, `m${n}.model.ts`),
    `import { ManyToOne, ModelLink, ModelRelated, OneToMany, Service, ServiceParameters, UuidModel } from "../runtime.js";
import type { Entity${next} } from "./m${next}.model.js";

/** Model ${n}. */
export class Entity${n} extends UuidModel {
  label: string = "";

  /** builtin coercion */
  createdAt: Date;

  /** builtin coercion */
  updatedAt: Date;

  /** set-method coercion through the ManyToOne alias */
  owner: ManyToOne<Entity${next}>;

  /** set-method coercion, direct */
  reviewer: ModelLink<Entity${next}>;

  /** relation-initializer through the OneToMany alias */
  children: OneToMany<Entity${next}>;

  /** relation-initializer, direct */
  siblings: ModelRelated<Entity${next}>;

  /** static must be skipped */
  static epoch: Date;

  /** existing accessor must be preserved */
  get slug(): string {
    return this.label.toLowerCase();
  }
}

/** Parameters for service ${n}. */
export class Params${n} extends ServiceParameters {
  endpoint: string = "";
  retries: number = 3;
}

/** Service ${n} — needs a generated loadParameters(). */
export class Service${n} extends Service<Params${n}> {
  run(): string {
    return this.parameters.endpoint;
  }
}
`
  );
}

writeFileSync(
  join(here, "src", "index.ts"),
  Array.from({ length: count }, (_, i) => {
    const n = String(i).padStart(3, "0");
    return `export { Entity${n}, Service${n} } from "./models/m${n}.model.js";`;
  }).join("\n") + "\n"
);

console.log(`generated ${count} models in ${modelsDir}`);
