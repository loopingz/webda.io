---
title: Documentation versions
---

# Documentation versions

The [v3 documentation](https://webda.io/v3/) is built from `maintenance/v3.x`, including the API reference generated from its packages. Use the version menu to open the [latest documentation](https://webda.io/) or [v4 documentation](https://webda.io/v4/).

To publish a v3 documentation fix, merge it into `maintenance/v3.x`, then run:

```bash
gh workflow run docs.yml --ref maintenance/v3.x -f ref=maintenance/v3.x -f lane=v3
```

The lane is deployed without replacing the latest or v4 documentation.

See the [v3 documentation contributor guide](https://github.com/loopingz/webda.io/blob/maintenance/v3.x/docs/CONTRIBUTING.md) for the fix procedure and a link to the checklist for future major versions.
