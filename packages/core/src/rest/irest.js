import { createMethodDecorator } from "@webda/tsc-esm";
/**
 * Route annotation to declare a route on a Bean
 * @param route
 * @param methods
 * @param openapi
 * @returns
 * @deprecated use @Operation instead
 */
export const Route = createMethodDecorator((value, context, route, methods = ["GET"], openapi = {}) => {
    var _a, _b;
    (_a = context.metadata)["webda.route"] ?? (_a["webda.route"] = {});
    (_b = context.metadata["webda.route"])[route] ?? (_b[route] = []);
    context.metadata["webda.route"][route].push({
        methods: Array.isArray(methods) ? methods : [methods],
        executor: context.name,
        openapi
    });
});
//# sourceMappingURL=irest.js.map