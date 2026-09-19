import { ModelLink, ModelRelated } from "./lib/runtime.js";
import { Post, MyService, MyServiceParameters } from "./lib/app.js";

const p = new Post();
p.createdAt = "2020-01-01";                      // builtin coercion
console.log("Date coercion   ->", p.createdAt instanceof Date, p.createdAt.toISOString());
p.author = "user-123";                            // set-method via alias
console.log("ModelLink coerce->", p.author instanceof ModelLink, p.author.uuid);
p.author = new ModelLink();                       // direct assignment path
console.log("ModelLink direct->", p.author instanceof ModelLink);
console.log("relation init   ->", p.comments instanceof ModelRelated);
p.title = "Hello World";
console.log("existing getter ->", p.slug);

const svc = new MyService();
const params = svc.loadParameters({ endpoint: "https://x", retries: 7 });
console.log("loadParameters  ->", params instanceof MyServiceParameters, params.endpoint, params.retries);
