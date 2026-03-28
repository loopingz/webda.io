/**
 * Interface to specify the Service parameters
 */
export declare class ServiceParameters {
    /**
     * Type of the service
     */
    type: string;
    /**
     * Watch for changes on the parameters and call watchers when a parameter is changed
     */
    private watchers;
    load(params?: any): this;
    /**
     * Update parameters and call watchers if a parameter was changed
     * @param params
     * @param delta
     * @returns
     */
    update(params: any, delta: any): this;
    /**
     * Watch for changes on the parameters and call watchers when a parameter is changed
     * @param callback
     * @returns
     */
    with(callback: (params: this) => void): this;
}
//# sourceMappingURL=serviceparameters.d.ts.map