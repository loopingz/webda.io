import type { AllFilter, AnyFilter, NotFilter } from "./logical";
import type { SqlFilter } from "./sql";
import type { ExactFilter, PrefixFilter, SuffixFilter } from "./string";

export type Filter = NotFilter | AllFilter | SqlFilter | ExactFilter | PrefixFilter | SuffixFilter | AnyFilter;
