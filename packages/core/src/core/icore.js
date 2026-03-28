import { AbstractService } from "../services/iservice.js";
export { AbstractService };
/**
 * Record the class as a Bean
 * @param constructor
 */
// @Bean to declare as a Singleton service
export function Bean(constructor) {
    const name = constructor.name;
    // @ts-ignore
    process.webdaBeans ?? (process.webdaBeans = {});
    // @ts-ignore
    process.webdaBeans[name] = constructor;
}
//# sourceMappingURL=icore.js.map