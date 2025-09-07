import { WebdaModule } from "../definition";
import { WebdaObjects } from "../module";
import { MetadataPlugin } from "./plugin";

/**
 * Events metadata plugin
 */
export class EventsMetadata extends MetadataPlugin {
    getMetadata(module: WebdaModule, objects: WebdaObjects): void {
        Object.keys(objects.models).forEach(name => {
            const { type } = objects.models[name];
            const eventsSymbol = type.getProperties().find(p => this.moduleGenerator.propertyIsKeyedBySymbol(p, "@webda/models", "WEBDA_EVENTS"));
            if (eventsSymbol) {
                const eventsType = this.moduleGenerator.typeChecker.getTypeOfSymbolAtLocation(eventsSymbol, eventsSymbol.valueDeclaration);
                const eventKeys = Object.keys(
                eventsType.getProperties().reduce((acc, prop) => {
                    acc[prop.getName()] = true;
                    return acc;
                }, {})
                );
                module.models[name].Events = eventKeys;
            }
        });
    }
}