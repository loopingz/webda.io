---
title: Documentation versions
---

# Documentation versions

The [latest documentation](https://webda.io/) is built from the head of `main`. The [v4 documentation](https://webda.io/v4/) is also built from `main` while v4 is the current major version. The [v3 documentation](https://webda.io/v3/) is built from `maintenance/v3.x`, including that branch's API reference.

Each lane is published independently after a release on its source branch. The version menu in the navigation bar switches between lanes.

See the [documentation contributor guide](https://github.com/loopingz/webda.io/blob/main/docs/CONTRIBUTING.md) for branch-specific fixes and the checklist for adding a future major version.

To publish a documentation fix for v3, merge the fix into `maintenance/v3.x`, then run:

```bash
gh workflow run docs.yml -f ref=maintenance/v3.x -f lane=v3
```

To republish the latest docs from the head of `main`, run:

```bash
gh workflow run docs.yml -f lane=latest
```

To republish v4 from the head of `main`, run `gh workflow run docs.yml -f lane=v4`. Run these commands from `main`, where the lane-aware workflow is defined. A lane build checks out its source branch and generates its API reference from that branch's packages.
