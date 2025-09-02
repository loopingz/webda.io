import { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";

/**
 * Actions metadata plugin
 */
export class ActionsMetadata extends MetadataPlugin {
    getMetadata(module: any, objects: WebdaObjects): void {
        Object.keys(objects.models).forEach(name => {
            const model = objects.models[name];
            const actionsSymbol = model.type.getProperties().find(p => this.moduleGenerator.propertyIsKeyedBySymbol(p, "@webda/models", "WEBDA_ACTIONS"));
            if (actionsSymbol) {
            const actionsType = this.moduleGenerator.typeChecker.getTypeOfSymbolAtLocation(actionsSymbol, actionsSymbol.valueDeclaration);
            const actionKeys = Object.keys(
                actionsType.getProperties().reduce((acc, prop) => {
                acc[prop.getName()] = true;
                return acc;
                }, {})
            );
            module.models[name].Actions = actionKeys.reduce((prev, value) => {
                prev[value] = {};
                return prev;
            }, {});
            }
            // Generate metadata for each model
        });
    }

}