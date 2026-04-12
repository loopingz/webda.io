---
name: Operation method signatures - no context parameter
description: Operations take typed (input, parameters) directly, not context. Context accessible via useContext() hook. Return values are the output. This is a breaking change from the old ctx.write() pattern.
type: feedback
---

Operations should be pure methods defined by their input parameters and return type. No OperationContext parameter.

**Why:** Operations should be protocol-agnostic. Passing context couples them to the execution framework. The method signature (parameters + return type) IS the operation contract.

**How to apply:** Operation methods take `(input?, parameters?)` and return the result. Use `useContext()` hook if session/headers are needed. `callOperation` handles writing the return value to context. Update all existing operation handlers (DomainService CRUD, model actions, binary ops).
