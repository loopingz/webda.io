---
sidebar_position: 3
sidebar_label: Service Lifecycle
---

# Service Lifecycle

Every Webda service follows a strict lifecycle managed by `Core`. Understanding this sequence is essential to writing services that initialize resources correctly and shut down cleanly.

## Lifecycle state machine

```mermaid
stateDiagram-v2
    [*] --> initial : new Service(name, params)
    initial --> resolving : resolve()
    resolving --> resolved : resolve() complete
    resolved --> initializing : init()
    initializing --> running : init() complete
    running --> stopping : Core.stop()
    stopping --> stopped : stop() complete
    stopped --> [*]
```

(`Core` itself transitions through `initial` → `resolving` → `resolved` → `initializing` → `ready` → `stopping` → `stopped`, plus `reinitializing` on config reload.)

## Lifecycle phases

### 1. Constructor

Called when the framework instantiates the service. The constructor must call `super(name, params)`. Do **not** do async work here.

```typescript
export class MyService extends Service<MyServiceParameters> {
  protected connection: DatabaseConnection;

  constructor(name: string, params: MyServiceParameters) {
    super(name, params);
    // Synchronous init only — no async, no network calls
  }
}
```

### 2. `resolve(): this`

Called immediately when each service is instantiated on first use (dependencies first), before `init()`. **Synchronous** — `resolve()` returns `this`, not a Promise. Use it to:
- Manually validate `this.parameters` (service parameters are not automatically validated against JSON Schema at startup; unknown keys are filtered, and you should check required values here)
- Read `@Inject` dependencies (populated during the service's own `resolve()`, which resolves dependencies on demand)
- Wire up cross-service references that don't require I/O

If you need to do async work, defer it to `init()`.

```typescript
resolve(): this {
  super.resolve();  // always call super first

  if (!this.parameters.apiKey) {
    throw new Error("apiKey is required in MyService configuration");
  }

  // At this point @Inject dependencies are already populated
  this.log("INFO", "Resolved with mailer:", this.mailer.getName());

  return this;
}
```

### 3. `init(): Promise<this>`

Called after `resolve()`. Use `init()` for async initialization:
- Open database connections
- Start background tasks
- Register event handlers

```typescript
async init(): Promise<this> {
  await super.init();

  this.connection = await DatabaseConnection.connect(this.parameters.url);
  this.log("INFO", "Connected to database", this.parameters.url);

  return this;
}
```

### 4. Running

The service is fully initialized. The application handles requests and the service processes them normally.

### 5. `stop(): Promise<void>`

Called during graceful shutdown (SIGINT, `Core.stop()`). `Core.stop()` stops all services concurrently via `Promise.all(...)`. Inside a service, release its own resources before calling `await super.stop()`:

```typescript
async stop(): Promise<void> {
  this.log("INFO", "Shutting down");

  // Close resources before calling super
  await this.connection.close();
  await this.backgroundTask.cancel();

  await super.stop();  // call super last
}
```

## Complete example

```typescript
import { Service, ServiceParameters, Inject } from "@webda/core";
import { Bean } from "@webda/core";

interface EmailServiceParameters extends ServiceParameters {
  smtpHost: string;
  smtpPort: number;
  from: string;
}

@Bean
export class EmailService extends Service<EmailServiceParameters> {
  protected transport: any;

  resolve(): this {
    super.resolve();

    if (!this.parameters.smtpHost) {
      throw new Error("smtpHost is required");
    }

    this.log("INFO", "Configuration validated", this.parameters.smtpHost, this.parameters.smtpPort);

    return this;
  }

  async init(): Promise<this> {
    await super.init();

    // Create SMTP transport
    this.transport = createTransport({
      host: this.parameters.smtpHost,
      port: this.parameters.smtpPort ?? 587
    });

    this.log("INFO", "SMTP transport initialized");
    return this;
  }

  async stop(): Promise<void> {
    this.log("INFO", "Closing SMTP transport");
    this.transport?.close();
    await super.stop();
  }

  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    await this.transport.sendMail({
      from: this.parameters.from,
      to,
      subject,
      html: body
    });
  }
}
```

## Sequence diagram

```mermaid
sequenceDiagram
    participant Launcher as webda CLI
    participant Core
    participant ServiceA
    participant ServiceB

    Launcher->>Core: new Core(application)
    Launcher->>Core: init()
    Core->>Core: resolve()
    Core->>ServiceA: new ServiceA() + resolve()
    note right of ServiceA: @Inject dependencies resolved on demand
    Core->>ServiceB: new ServiceB() + resolve()
    note right of Core: initOrders: Stores first, then creation order
    Core->>ServiceA: init()
    note right of ServiceA: connect to DB, start timers
    Core->>ServiceB: init()
    Launcher->>Core: (running — handling requests)
    Launcher->>Core: stop()
    par Stop services in parallel
        Core->>ServiceA: stop()
    and
        Core->>ServiceB: stop()
    end
```

## Key rules

1. **Always call `super.resolve()`** first in `resolve()` (synchronous).
2. **Always call `await super.init()`** first in `init()`.
3. **Call `await super.stop()` last** in `stop()` after releasing the service's own resources (`Core.stop()` stops all services in parallel).
4. **Never do async work in `resolve()`** — `resolve()` is sync. Defer async work to `init()`.
5. **Never do async work in the constructor** — use `init()`.
6. **Never access `@Inject` dependencies in the constructor** — they are not yet populated. Access them in `resolve()` or later.

## Verify

```bash
cd packages/core
pnpm test
```

```
✓ packages/core — service lifecycle tests pass
```

## See also

- [Architecture](./Architecture.md) — how `Core` orchestrates the lifecycle
- [Services](./Services.md) — `Service` base class, `@Bean`, `@Inject`
- [Events](./Events.md) — `Webda.Init.Services` and other lifecycle events
