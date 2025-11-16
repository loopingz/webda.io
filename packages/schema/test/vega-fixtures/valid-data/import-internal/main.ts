import { ExposedSubType, InternalAlias, InternalSubType } from "./module.js";

export interface MyObject {
    internalSubType: InternalSubType;
    internalAlias: InternalAlias;
    exposedSubType: ExposedSubType;
}
