import { ProcessCache } from "@webda/cache";
declare const SessionCache: {
    (value: import("@webda/decorators").AnyMethod, context: ClassMethodDecoratorContext<any, any>): void | import("@webda/decorators").AnyMethod;
    (...args: any[]): (value: import("@webda/decorators").AnyMethod, context: ClassMethodDecoratorContext<any, any>) => void | import("@webda/decorators").AnyMethod;
} & {
    clear: (target: object, propertyKey: string, ...args: any[]) => void;
    clearAll: (target: object, propertyKey?: string) => void;
    garbageCollect: () => void;
    getStats: () => import("@webda/cache").CacheStats;
    resetStats: () => void;
};
declare const InstanceCache: {
    (value: import("@webda/decorators").AnyMethod, context: ClassMethodDecoratorContext<any, any>): void | import("@webda/decorators").AnyMethod;
    (...args: any[]): (value: import("@webda/decorators").AnyMethod, context: ClassMethodDecoratorContext<any, any>) => void | import("@webda/decorators").AnyMethod;
} & {
    clear: (target: object, propertyKey: string, ...args: any[]) => void;
    clearAll: (target: object, propertyKey?: string) => void;
    garbageCollect: () => void;
    getStats: () => import("@webda/cache").CacheStats;
    resetStats: () => void;
};
declare const ContextCache: {
    (value: import("@webda/decorators").AnyMethod, context: ClassMethodDecoratorContext<any, any>): void | import("@webda/decorators").AnyMethod;
    (...args: any[]): (value: import("@webda/decorators").AnyMethod, context: ClassMethodDecoratorContext<any, any>) => void | import("@webda/decorators").AnyMethod;
} & {
    clear: (target: object, propertyKey: string, ...args: any[]) => void;
    clearAll: (target: object, propertyKey?: string) => void;
    garbageCollect: () => void;
    getStats: () => import("@webda/cache").CacheStats;
    resetStats: () => void;
};
export { SessionCache, InstanceCache, ContextCache, ProcessCache };
//# sourceMappingURL=cache.d.ts.map