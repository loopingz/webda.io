# @webda/create

Create a [Webda](https://webda.io) v4 application, ready for coding agents.

```bash
npm create @webda my-app
pnpm create @webda my-app --store postgres --transports rest,graphql --yes
```

| Flag                       | Values                                         | Default                                 |
| -------------------------- | ---------------------------------------------- | --------------------------------------- |
| `--store`                  | `memory`, `file`, `mongodb`, `postgres`        | `memory`                                |
| `--transports`             | comma list of `rest`, `graphql`, `grpc`, `mcp` | `rest`                                  |
| `--namespace`              | application namespace                          | from the directory name                 |
| `--pm`                     | `pnpm`, `npm`, `yarn`                          | the package manager running the command |
| `--no-install`, `--no-git` | skip install / git init                        |                                         |
| `--yes`, `-y`              | accept defaults, never prompt                  |                                         |

With `npm`, the generated app also gets a `.npmrc` setting `legacy-peer-deps=true`: npm 10 (bundled with Node 22) crashes
on the optional peer dependencies of vitest/vite. It is safe to remove with npm >= 11.

The generated app contains `AGENTS.md`, `CLAUDE.md` and skills in `.agents/skills/`.
In an existing v4 project, Claude Code users can install the same skills:

```text
/plugin marketplace add loopingz/webda.io
/plugin install webda@webda
```
