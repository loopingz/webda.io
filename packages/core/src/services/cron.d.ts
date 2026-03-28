import { schedule } from "node-cron";
import { Service } from "./service.js";
import { CancelablePromise } from "@webda/utils";
export declare const CronSymbol: unique symbol;
/**
 * Cron item
 */
export declare class CronDefinition {
    /**
     * Cron definition
     * * * * 0 3
     * @pattern ^(\*|([0-5]?\d)) (\*|([01]?\d|2[0-3])) (\*|([01]?\d|2[0-3])) (\*|([0-6])) (\*|([0-6]))$
     */
    cron: string;
    /**
     * Description of the task
     */
    description: string;
    /**
     * Argument to be passed to the function
     */
    args: any[];
    /**
     * Method to call
     */
    method: string;
    /**
     * Webda service name
     */
    serviceName: string;
    /**
     *
     * @param cron
     * @param args
     * @param serviceName
     * @param method
     * @param description
     */
    constructor(cron: string, args?: any[], serviceName?: string, method?: string, description?: string);
    toString(): string;
}
/**
 * @WebdaModda
 */
declare class CronService extends Service {
    enable: boolean;
    crons: {
        cron: string;
        description?: string;
        serviceName?: string;
        method?: string;
        context?: string;
        args?: any[];
        cb?: () => void;
    }[];
    crontabSchedule: typeof schedule;
    private _scanned;
    static Annotation(cron: string, description?: string, ...args: any[]): MethodDecorator;
    static getCronId(cron: CronDefinition, name?: string): string;
    static loadAnnotations(services: any): CronDefinition[];
    addAnnotations(): void;
    getCrontab(): {
        cron: string;
        description?: string;
        serviceName?: string;
        method?: string;
        context?: string;
        args?: any[];
        cb?: () => void;
    }[];
    work(annotations?: string): CancelablePromise;
    run(annotations?: boolean): CancelablePromise;
    schedule(cron: string, cb: () => any, description?: string): void;
}
export declare function Cron(cron: string, description?: string, ...args: any[]): <T extends (this: Service, ...a: any[]) => Promise<any>>(value: T, context: ClassMethodDecoratorContext<Service, T>) => T;
export { CronService };
//# sourceMappingURL=cron.d.ts.map