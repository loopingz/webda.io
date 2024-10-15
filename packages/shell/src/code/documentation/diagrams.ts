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

import { Core, CoreEvents, ModelAction, ModelsTree, Service } from "@webda/core";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { JSONSchema7 } from "json-schema";
import { Constructor } from "@webda/tsc-esm";

/**
 * Abstract diagram with the common replacement methods
 */
export abstract class Diagram {
  append: boolean;
  content: string;
  file: string;

  constructor(protected name: string) {}

  update(file: string, webda: Core) {
    this.file = file;
    if (existsSync(file)) {
      this.content = readFileSync(file, "utf8").toString();
    } else {
      this.content = "";
    }
    let diagram = this.generate(webda);
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
      const storeName = webda.getModelStore(webda.getModel(name)).getName();
      stores[storeName] ??= [];
      stores[storeName].push(name);
      for (const child in children) {
        diagram += `\t${child} --> ${name}\n`;
        recursive(child, children[child]);
      }
    };
    recursive("CoreModel", tree.children);
    // Add subgraph for Stores
    for (const store in stores) {
      diagram += `\n\tsubgraph ${store}\n`;
      for (const model of stores[store]) {
        diagram += `\t\t${model}\n`;
      }
      diagram += `\tend\n`;
    }
    return diagram + "```";
  }
}

/**
 * Export each CoreModel, their properties and actions
 */
export class ModelDiagram extends Diagram {
  constructor() {
    super("ClassDiagram");
  }

  generateClassDefinition(
    schema: JSONSchema7,
    actions: {
      [key: string]: ModelAction;
    }
  ): string {
    let definition: string = "";

    if (schema.description) {
      definition += `\t\t${schema.title}: ${schema.description}\n`;
    }

    const properties = schema.properties;
    // Display properties
    for (const propertyName in properties) {
      const property = <JSONSchema7>properties[propertyName];
      const isRequired = schema.required && schema.required.includes(propertyName);
      const propertyType = property.type;

      definition += `\t\t${isRequired ? "+" : "-"}${propertyName}: ${propertyType}\n`;
    }

    // Display actions
    for (const actionName in actions) {
      definition += `\t\t+${actionName}()\n`;
    }
    return definition;
  }

  generate(webda: Core<CoreEvents>): string {
    const models = webda.getApplication().getModels();
    let diagram = "```mermaid\nclassDiagram\n";
    Object.values(models).forEach(model => {
      diagram += `\tclass ${model.getIdentifier()}{\n`;
      diagram += this.generateClassDefinition(model.getSchema() || { properties: {} }, model.getActions());
      diagram += `\t}\n`;
    });
    return diagram + "```";
  }
}

/**
 * Export each Service and their dependencies
 *
 * It detect dependencies by looking at the attributes of the service
 * So dynamic dependencies are not detected
 */
export class ServiceDiagram extends Diagram {
  constructor() {
    super("ServiceDiagram");
  }

  generate(webda: Core<CoreEvents>): string {
    const services = Object.values(webda.getServices()).filter(service => service.getName);
    let diagram = "```mermaid\nflowchart TD\n";
    const ids = {};
    services.forEach((service, i) => {
      diagram += `\tS${i}(${service.getName()}<br /><i>${service.getParameters().type}</i>)\n`;
      ids[service.getName()] = i;
    });
    services.forEach((service, i) => {
      for (const attr in service) {
        if (service[attr] instanceof Service) {
          diagram += `\tS${i} -->|${attr}| S${ids[service[attr].getName()]}\n`;
        }
      }
    });
    return diagram + "```";
  }
}

export const DiagramTypes: { [key: string]: Constructor<Diagram, []> } = {
  storage: StorageDiagram,
  models: ModelDiagram,
  services: ServiceDiagram
};
