/*
StorageDiagram
<!-- WEBDA:StorageDiagram -->
```mermaid
flowchart BT
    CoreModel
    User --> CoreModel
    Task --> CoreModel
    CustomUser --> User


    subgraph MyStore    
        User
        CustomUser
    end
```
<!-- /WEBDA:StorageDiagram -->
*/

import { Constructor, Core, CoreEvents, ModelsTree } from "@webda/core";
import { readFileSync, writeFileSync } from "fs";

/**
 * Abstract diagram with the common replacement methods
 */
export abstract class Diagram {
  _diagram: string;
  append: boolean;
  content: string;
  file: string;

  constructor(protected name: string) {
    this._diagram = "";
  }

  update(file: string, webda: Core) {
    this.file = file;
    this.content = readFileSync(file, "utf8").toString();
    let diagram = this.generate(webda);
    if (diagram === "") {
      throw new Error("Diagram is empty");
    }
    diagram = `<!-- WEBDA:${this.name} -->\n${diagram}\n<!-- /WEBDA:${this.name} -->`;
    if (this.content.includes(`<!-- WEBDA:${this.name} -->`)) {
      const regexp = new RegExp(`<!-- WEBDA:${this.name} -->[\\s\\S]*?<!-- \\/WEBDA:${this.name} -->`, "gm");
      this.content = this.content.replace(regexp, diagram);
    } else {
      this.content += `\n${diagram}\n`;
    }
    writeFileSync(this.file, this.content);
  }

  abstract generate(webda: Core): string;

  addDiagram(diagram) {
    this._diagram += diagram;
  }

  getDiagram() {
    return this._diagram;
  }
}

/**
 * Export each CoreModel and their Store
 */
export class StorageDiagram extends Diagram {
  constructor() {
    super("StorageDiagram");
  }

  generate(webda: Core): string {
    let diagram = "```mermaid\nflowchart BT\n";
    const tree = webda.getApplication().getModelHierarchy("CoreModel");
    const stores: { [key: string]: string[] } = {};
    const recursive = (name: string, children: ModelsTree) => {
      let storeName = webda.getModelStore(webda.getModel(name)).getName();
      stores[storeName] ??= [];
      stores[storeName].push(name);
      for (let child in children) {
        diagram += `\t${child} --> ${name}\n`;
        recursive(child, children[child]);
      }
    };
    recursive("CoreModel", tree.children);
    // Add subgraph for Stores
    for (let store in stores) {
      diagram += `\n\tsubgraph ${store}\n`;
      for (let model of stores[store]) {
        diagram += `\t\t${model}\n`;
      }
      diagram += `\tend\n`;
    }
    return diagram + "```";
  }
}

/*
ClassDiagram
*/
export class ClassDiagram extends Diagram {
  constructor() {
    super("ClassDiagram");
  }

  generate(webda: Core<CoreEvents>): string {
    const models = webda.getApplication().getModels();
    let diagram = "```mermaid\nclassDiagram\n";
    Object.values(models).forEach(model => {
      diagram += `\tclass ${model.getIdentifier()}{\n`;

      diagram += `\t}\n`;
    });
    return diagram + "```";
  }
}

/*
ServiceDiagram
*/
export class ServiceDiagram extends Diagram {
  constructor() {
    super("ServiceDiagram");
  }

  generate(webda: Core<CoreEvents>): string {
    const services = webda.getServices();
    return "";
  }
}

export const DiagramTypes: { [key: string]: Constructor<Diagram, []> } = {
  storage: StorageDiagram,
  models: ClassDiagram,
  services: ServiceDiagram
};
