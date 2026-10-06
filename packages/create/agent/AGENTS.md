# __APP_NAME__

A [Webda](https://webda.io) v4 application. Webda is a model-driven Node.js framework: you write models and services, and it exposes them through the configured transports (REST, GraphQL, gRPC, MCP) with validation and permissions.

## Commands

```bash
npm run build   # compile src/ to lib/ and generate webda.module.json and .webda/
npm run debug   # build, then start the dev server with the interactive debug console on http://localhost:18080
npm run serve   # build, then start the HTTP server on http://localhost:18080 (no terminal UI)
npm test        # build, then run the tests
```

## Layout

- `src/models/*.model.ts`: domain models
- `src/services/*.service.ts`: services
- `test/`: tests
- `webda.config.json`: services and parameters

## Rules

- Design the models first; put behaviour that is not about one model in a service.
- Persist through the model: `Task.create({...})`, `Task.ref(uuid).get()`, `Task.query("done = false")`, or `useRepository(Task)`. Never inject or call a store.
- Configuration belongs in `webda.config.json`, not in code.
- Never edit generated files: `.webda/`, `webda.module.json`, `lib/`.
- After a change, run `npm run build` then `npm test`.
- Agents and non-interactive shells: use `npm run serve`; `npm run debug` opens a fullscreen terminal UI.

## This app

<!-- WEBDA:APP -->

## Skills

Read the matching skill before working on a task:

| Task                                                       | Skill                                         |
| ---------------------------------------------------------- | --------------------------------------------- |
| Add or change a model, its validation or relations         | `.agents/skills/webda-models/SKILL.md`        |
| Add or change a service                                    | `.agents/skills/webda-services/SKILL.md`      |
| Expose behaviour as an operation; REST, GraphQL, gRPC, MCP | `.agents/skills/webda-operations/SKILL.md`    |
| Configuration and parameters                               | `.agents/skills/webda-configuration/SKILL.md` |
| Choose or switch the store; read and write data            | `.agents/skills/webda-stores/SKILL.md`        |
| Write or fix tests                                         | `.agents/skills/webda-testing/SKILL.md`       |
