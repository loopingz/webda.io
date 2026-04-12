---
name: Operation methods should return values
description: Operations should be normal methods that return results (or void for direct stream handling), with AsyncGenerator support for streaming. The framework should handle writing the return value to context.
type: feedback
---

Operations should be normal methods that return either the result or void if they handle the stream directly. AsyncGenerators should be supported to stream results.

**Why:** The current pattern of requiring `ctx.write(result)` is unnatural. Methods should just return their value like normal functions. The framework wraps the call and writes the return value to context automatically.

**How to apply:** When modifying `callOperation` or operation execution, check if the method returns a value and write it to context. If it returns an AsyncGenerator, stream the results.
