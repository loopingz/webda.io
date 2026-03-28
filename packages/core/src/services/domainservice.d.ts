import type { DeepPartial } from "@webda/tsc-esm";
import { TransformCaseType } from "@webda/utils";
import { Service } from "./service.js";
import { Application } from "../application/application.js";
import { OperationContext } from "../contexts/operationcontext.js";
import type { Model, ModelClass } from "@webda/models";
import { BinaryFileInfo, BinaryMap } from "./binary.js";
import { ServiceParameters } from "../services/serviceparameters.js";
export declare class DomainServiceParameters extends ServiceParameters {
    /**
     * Expose objects as operations too
     *
     * @default true
     */
    operations?: boolean;
    /**
     * Transform the name of the model to be used in the URL
     *
     * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
     * @default camelCase
     */
    nameTransfomer?: TransformCaseType;
    /**
     * Method used for query objects
     *
     * @default "PUT"
     */
    queryMethod?: "PUT" | "GET";
    /**
     * List of models to include
     *
     * If model is prefixed with a ! it will be excluded
     *
     * @default ["*"]
     */
    models?: string[];
    /**
     * Used to store the excluded models
     * @SchemaIgnore
     */
    private excludedModels;
    load(params?: any): this;
    /**
     * Is a model is included in the service
     * @param model
     * @returns
     */
    isIncluded(model: string): boolean;
    /**
     * Is a model excluded from the service
     * @param model
     * @returns
     */
    isExcluded(model: string): boolean;
}
export type DomainServiceEvents = {
    "Store.WebNotFound": {
        context: OperationContext;
        uuid: string;
    };
};
/**
 * Domain Service expose all the models as Route and Operations
 *
 * Model are exposed if they have a Expose decorator
 *
 * Children models Exposed should be under the first ModelRelated targetting them or the segment endpoint of Expose
 *
 * Other relations (ModelLinks, ModelParent) should only display their information but not be exposed
 * ModelRelated should be ignored
 */
export declare abstract class DomainService<T extends DomainServiceParameters = DomainServiceParameters, E extends DomainServiceEvents = DomainServiceEvents> extends Service<T, E> {
    app: Application;
    static schemas: {
        uuidRequest: {
            type: string;
            properties: {
                uuid: {
                    type: string;
                };
            };
            required: string[];
        };
        binaryGetRequest: {
            type: string;
            properties: {
                uuid: {
                    type: string;
                };
                index: {
                    type: string;
                };
            };
            required: string[];
        };
        binaryHashRequest: {
            type: string;
            properties: {
                uuid: {
                    type: string;
                };
                hash: {
                    type: string;
                };
            };
            required: string[];
        };
        binaryIndexHashRequest: {
            type: string;
            properties: {
                uuid: {
                    type: string;
                };
                index: {
                    type: string;
                };
                hash: {
                    type: string;
                };
            };
            required: string[];
        };
        binaryAttachParameters: {
            type: string;
            properties: {
                filename: {
                    type: string;
                };
                size: {
                    type: string;
                };
                mimetype: {
                    type: string;
                };
                uuid: {
                    type: string;
                };
            };
            required: string[];
        };
        binaryChallengeRequest: {
            type: string;
            properties: {
                hash: {
                    type: string;
                };
                challenge: {
                    type: string;
                };
            };
            required: string[];
        };
        searchRequest: {
            type: string;
            properties: {
                query: {
                    type: string;
                };
            };
        };
    };
    /**
     * Load the paremeters for your service
     * @param params
     * @param name
     */
    abstract loadParameters(params: DeepPartial<T>): T;
    /**
     * Return the model name for this service
     * @param name
     * @returns
     *
     * @see https://blog.boot.dev/clean-code/casings-in-coding/#:~:text=%F0%9F%94%97%20Camel%20Case,Go
     */
    transformName(name: string): string;
    /**
     * Handle one model and expose it based on the service
     * @param model
     * @param name
     * @param context
     * @returns
     */
    abstract handleModel(model: ModelClass, name: string, context: any): boolean;
    /**
     * Explore the models
     * @param model
     * @param name
     * @param depth
     * @param modelContext
     * @returns
     */
    walkModel(model: ModelClass, name?: string, depth?: number, modelContext?: any): void;
    /**
     * Your service is now created as all the other services
     */
    resolve(): this;
    getRootExposedModels(): import("../index.js").ModelDefinition<any>[];
    /**
     *
     * @param model
     * @param uuid
     */
    private getModel;
    /**
     * Create a model operation implementation
     * @param context
     */
    modelCreate(context: OperationContext): Promise<void>;
    /**
     * Update a model operation implementation
     * @param context
     */
    modelUpdate(context: OperationContext): Promise<void>;
    /**
     * Get a model operation implementation
     * @param context
     */
    modelGet(context: OperationContext): Promise<void>;
    /**
     * Delete a model operation implementation
     * @param context
     */
    modelDelete(context: OperationContext): Promise<void>;
    /**
     * Query models
     * @param context
     */
    modelQuery(context: OperationContext): Promise<void>;
    /**
     * Patch a model
     * @param context
     */
    modelPatch(context: OperationContext): Promise<void>;
    /**
     * Action on a model
     * @param context
     */
    modelAction(context: OperationContext): Promise<void>;
    /**
     * Add operations for all exposed models
     * @returns
     */
    initOperations(): void;
    addBinaryOperations(model: ModelClass<Model>, Metadata: any, name: string): void;
    /**
     * Implement the binary challenge operation
     * @param context
     */
    binaryChallenge(context: OperationContext<BinaryFileInfo & {
        hash: string;
        challenge: string;
    }>): Promise<void>;
    /**
     *
     * @param property
     * @param hash
     * @returns
     */
    protected checkBinaryAlreadyLinked(property: BinaryMap | BinaryMap[], hash: string): boolean;
    /**
     * Set the binary content
     * @param context
     */
    binaryPut(context: OperationContext): Promise<void>;
    /**
     * Get the binary content
     * @param context
     */
    binaryGet(context: OperationContext): Promise<void>;
    binaryAction(context: OperationContext): Promise<void>;
}
/**
 * @WebdaModda
 */
export declare class ModelsOperationsService<T extends DomainServiceParameters> extends DomainService<T> {
    /**
     * Default domain
     */
    loadParameters(params: DeepPartial<DomainServiceParameters>): T;
    /**
     * Do nothing here
     */
    handleModel(model: ModelClass, name: string, context: any): boolean;
}
//# sourceMappingURL=domainservice.d.ts.map