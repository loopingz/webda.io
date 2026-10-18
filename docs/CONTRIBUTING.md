# Contributing to the v3 documentation

The [v3 site](https://webda.io/v3/) is built from `maintenance/v3.x`. Edit documentation on this branch so its guides and generated API reference continue to describe the v3 packages. A change merged only into `main` will not appear on `/v3/`.

## Fix and republish v3

1. Make the change under `docs/` on `maintenance/v3.x` and merge it into that branch. Apply the same fix to `main` separately if it also affects current documentation.
2. A release on `maintenance/v3.x` publishes `/v3/`. To publish a docs fix without a release, run:

   ```bash
   gh workflow run docs.yml --ref maintenance/v3.x -f ref=maintenance/v3.x -f lane=v3
   ```

3. Check the workflow run and [the v3 site](https://webda.io/v3/). The banner should identify v3, and `/` and `/v4/` should still work.

The workflow uses Yarn and Node 20 for this branch. It builds Typedoc from the v3 package sources, deploys only the `v3` folder on `gh-pages`, and removes root-only files such as `CNAME` and `sitemap.xml` before deployment.

For the current version's republish commands and the checklist for adding the next major documentation lane, see the [main documentation contributor guide](https://github.com/loopingz/webda.io/blob/main/docs/CONTRIBUTING.md). When a new lane is added, update `docs/static/versions.json` on this branch so the v3 version menu links to it.
