export class AbstractDeployer {
    /**
     * Allow to specify the JSONSchema to configure this service
     *
     * Return undefined by default to fallback on the guess from ServiceParamaters
     *
     * Using this method should only be exception
     */
    static getSchema() {
        return undefined;
    }
}
//# sourceMappingURL=abstractdeployer.js.map