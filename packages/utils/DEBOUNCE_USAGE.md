# Debounce Usage Guide

The debounce utility delays invoking a function until after a specified time has elapsed since the last time it was called. This is useful for rate-limiting expensive operations like API calls, search queries, or window resize handlers.

## Basic Usage

```typescript
import { debounce } from "@webda/utils";

// Create a debounced function that waits 300ms
const saveData = debounce(async (data: string) => {
  await api.save(data);
  console.log("Data saved:", data);
}, 300);

// Call multiple times rapidly
saveData("hello");
saveData("world");
saveData("!"); // Only this call executes after 300ms
```

## Options

### Leading Edge Execution

Execute on the leading edge of the timeout (immediately on first call):

```typescript
const logMessage = debounce(
  (msg: string) => console.log(msg),
  1000,
  { leading: true, trailing: false }
);

logMessage("First"); // Logs immediately
logMessage("Second"); // Ignored
logMessage("Third"); // Ignored
// Wait 1000ms, nothing more happens
```

### Trailing Edge Execution (Default)

Execute on the trailing edge (after calls stop):

```typescript
const search = debounce(
  (query: string) => api.search(query),
  500,
  { trailing: true } // This is the default
);

search("a");
search("ab");
search("abc"); // Only executes 500ms after this call
```

### Both Leading and Trailing

```typescript
const handler = debounce(
  () => console.log("Handling..."),
  1000,
  { leading: true, trailing: true }
);

handler(); // Logs immediately (leading)
handler();
handler(); // Logs again 1000ms after last call (trailing)
```

### Maximum Wait Time

Ensure the function is called at least once within a specified time:

```typescript
const updateUI = debounce(
  () => render(),
  100,
  { maxWait: 500 } // Will execute at most every 500ms
);

// Even if called continuously, will execute every 500ms
setInterval(() => updateUI(), 50);
```

## Control Methods

### Cancel Pending Invocations

```typescript
const save = debounce(() => api.save(), 1000);

save();
save();
save.cancel(); // Cancel all pending calls
```

### Flush Immediately

```typescript
const save = debounce(() => api.save(), 1000);

save();
save();
save.flush(); // Execute immediately, don't wait
```

### Check Pending Status

```typescript
const save = debounce(() => api.save(), 1000);

console.log(save.pending()); // false

save();
console.log(save.pending()); // true

await new Promise(resolve => setTimeout(resolve, 1100));
console.log(save.pending()); // false
```

## Real-World Examples

### Search Input

```typescript
import { debounce } from "@webda/utils";

class SearchComponent {
  private performSearch = debounce(async (query: string) => {
    const results = await api.search(query);
    this.displayResults(results);
  }, 300);

  onInputChange(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.performSearch(query);
  }
}
```

### Window Resize Handler

```typescript
import { debounce } from "@webda/utils";

const handleResize = debounce(() => {
  console.log("Window resized to:", window.innerWidth, window.innerHeight);
  // Expensive layout calculations here
}, 200);

window.addEventListener("resize", handleResize);
```

### Auto-Save Form

```typescript
import { debounce } from "@webda/utils";

class FormComponent {
  private autoSave = debounce(
    async (formData: FormData) => {
      await api.saveDraft(formData);
      console.log("Draft saved");
    },
    2000,
    { maxWait: 10000 } // Save at least every 10 seconds
  );

  onFormChange(data: FormData) {
    this.autoSave(data);
  }

  onSubmit(data: FormData) {
    // Cancel auto-save and submit immediately
    this.autoSave.cancel();
    api.submitForm(data);
  }
}
```

### API Rate Limiting

```typescript
import { debounce } from "@webda/utils";

class AnalyticsService {
  private sendEvent = debounce(
    async (event: AnalyticsEvent) => {
      await api.track(event);
    },
    1000,
    { leading: true, maxWait: 5000 }
  );

  track(event: AnalyticsEvent) {
    this.sendEvent(event);
  }
}
```

## Type Safety

The debounce function preserves the type signature of your function:

```typescript
// Function with typed parameters and return value
function saveUser(id: string, name: string): Promise<void> {
  return api.updateUser(id, { name });
}

const debouncedSave = debounce(saveUser, 500);

// TypeScript knows the parameter types
debouncedSave("123", "John"); // ✓ OK
debouncedSave(123, "John");   // ✗ Type error: number is not assignable to string
```

## Comparison with Throttle

- **Debounce**: Delays execution until calls stop coming
  - Use for: search inputs, form validation, auto-save
  - Guarantees: Function executes only after quiet period

- **Throttle**: Limits execution rate to once per interval
  - Use for: scroll handlers, mouse move, resize events
  - Guarantees: Function executes at most once per interval

## Performance Considerations

1. **Memory**: Each debounced function stores a timer reference and last arguments
2. **Cleanup**: Always cancel debounced functions when components unmount:

```typescript
class MyComponent {
  private saveData = debounce(() => api.save(), 1000);

  cleanup() {
    this.saveData.cancel(); // Prevent memory leaks
  }
}
```

3. **Browser/Node**: Works in both environments using the appropriate timer APIs

## Migration from Lodash

The API is similar to lodash's `_.debounce`:

```typescript
// Lodash
import _ from "lodash";
const debounced = _.debounce(fn, 300, { leading: true, trailing: false, maxWait: 1000 });

// Webda Utils (identical API)
import { debounce } from "@webda/utils";
const debounced = debounce(fn, 300, { leading: true, trailing: false, maxWait: 1000 });
```
