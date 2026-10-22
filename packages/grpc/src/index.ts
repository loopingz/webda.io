import { registerWebdaPackage } from "@webda/utils";
export { GrpcService, GrpcServiceParameters } from "./grpcservice.service.js";
export { GrpcStream, GrpcStatus } from "./grpc-stream.js";
export type { GrpcMethodDef } from "./grpc-stream.js";
export { generateProto } from "./proto-generator.js";

// Refuse a second copy of the package, see registerWebdaPackage
registerWebdaPackage("@webda/grpc", import.meta.url);
