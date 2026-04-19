import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { inferKind, InferContext } from "./infer.js";

function ctx(fieldName: string, declaredType?: string): InferContext {
  return { fieldName, declaredType };
}

@suite("inferKind — name heuristic")
class InferNameTest {
  @test({ name: "email → email" })
  email() { expect(inferKind(ctx("email"))).toBe("email"); }

  @test({ name: "phoneNumber → phone" })
  phone() { expect(inferKind(ctx("phoneNumber"))).toBe("phone"); }

  @test({ name: "firstName → firstName" })
  firstName() { expect(inferKind(ctx("firstName"))).toBe("firstName"); }

  @test({ name: "createdAt → recentDate" })
  createdAt() { expect(inferKind(ctx("createdAt", "Date"))).toBe("recentDate"); }

  @test({ name: "uuid → uuid" })
  uuid() { expect(inferKind(ctx("uuid"))).toBe("uuid"); }

  @test({ name: "contactEmail → not auto-inferred (substring does not match)" })
  substringNoMatch() { expect(inferKind(ctx("contactEmail"))).not.toBe("email"); }

  @test({ name: "name comparison is case-insensitive" })
  caseInsensitive() { expect(inferKind(ctx("EMAIL"))).toBe("email"); }
}

@suite("inferKind — type fallback")
class InferTypeTest {
  @test({ name: "string → lorem" })
  str() { expect(inferKind(ctx("unknownField", "string"))).toBe("lorem"); }

  @test({ name: "number → integer" })
  num() { expect(inferKind(ctx("unknownField", "number"))).toBe("integer"); }

  @test({ name: "boolean → boolean" })
  bool() { expect(inferKind(ctx("unknownField", "boolean"))).toBe("boolean"); }

  @test({ name: "Date → recentDate" })
  date() { expect(inferKind(ctx("unknownField", "Date"))).toBe("recentDate"); }

  @test({ name: "unknown type, unknown name → null" })
  unknown() { expect(inferKind(ctx("weirdField", "SomeClass"))).toBeNull(); }
}
