export const VERSION = "4.0.0-beta.1";

export { generate, type GenerateOptions, type MockContext, type Mode } from "./engine/generate.js";
export { generateGraph } from "./engine/graph.js";
export { SessionPool } from "./engine/pool.js";
export { makeFaker } from "./engine/faker.js";
export { inferKind, type InferContext } from "./engine/infer.js";
export type { AIProvider } from "./ai/provider.js";
export { MockAIProvider } from "./ai/provider.js";
export { AnthropicProvider } from "./ai/anthropic.js";
