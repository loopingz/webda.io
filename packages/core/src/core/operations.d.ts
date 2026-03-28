import { OperationDefinition } from "./icore.js";
import { OperationContext } from "../contexts/operationcontext.js";
import { Service } from "../services/service.js";
import { Model } from "@webda/models";
type OperationTarget = Service | Model | typeof Service | typeof Model;
/**
 * Call an operation within the framework
 */
export declare function callOperation(context: OperationContext, operationId: string): Promise<void>;
/**
 * Get available operations
 * @returns
 */
export declare function listOperations(): {
    [key: string]: Omit<OperationDefinition, "service" | "method">;
};
/**
 * Register a new operation within the app
 * @param operationId
 * @param definition
 */
export declare function registerOperation(operationId: string, definition: Omit<OperationDefinition, "id">): void;
export interface RestParameters {
    rest?: false | {
        method: "get" | "post" | "put" | "delete" | "patch";
        path: string;
        responses?: {
            [statusCode: string]: {
                description?: string;
                content?: {
                    [mediaType: string]: any;
                };
            };
        };
    };
}
export interface GrpcParameters {
    grpc?: false | {
        streaming?: "none" | "client" | "server" | "bidi";
    };
}
export interface GraphQLParameters {
    graphql?: false | {
        query?: string;
        mutation?: string;
        subscription?: string;
    };
}
/**
 * Wrapper concept for an operation
 *
 * Wrapper will launch the operation but they can wrap it with additional logic
 * It allows to set some asyncStorage
 *
 * Logging configuration per Operation
 * Metrics, Tracing
 *
 */
interface OperationParameters {
    /**
     * A unique operation id
     *
     * If a . is present it will be considered as a unique operation
     * If no . is present the operation will be prefixed with the Service name or the Model name
     */
    id?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    hidden?: boolean;
    deprecated?: boolean;
    /**
     * Permission query to check before executing the operation
     */
    permissionQuery?: string;
}
declare function Operation<T = {}>(options?: T & OperationParameters): (target: (this: OperationTarget, ...args: any) => any, context: ClassMethodDecoratorContext) => void;
declare function Operation(target: (this: OperationTarget, ...args: any) => any, context: ClassMethodDecoratorContext): void;
export { Operation };
//# sourceMappingURL=operations.d.ts.map