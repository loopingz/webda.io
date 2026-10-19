# Contributing to the documentation

Documentation is published in **lanes**. Each lane builds the guides and API reference from one source branch. Edit the branch that owns the version you want to change; generated Typedoc files do not need to be committed.

| Published site | Source branch | When it is published |
| --- | --- | --- |
| [latest](https://webda.io/) | `main` | Release on `main`, or manual dispatch |
| [v4](https://webda.io/v4/) | `main` while v4 is current | Release on `main`, or manual dispatch |
| [v3](https://webda.io/v3/) | `maintenance/v3.x` | Release on `maintenance/v3.x`, or manual dispatch |

The repository uses `maintenance/v3.x` as the branch name; `maintenance/v3` does not exist.

## Fix an existing version

1. Check out the source branch for that lane and edit files under `docs/`. For a v3 fix, make the change on `maintenance/v3.x` and merge it there. A change merged only into `main` will not appear on `/v3/`.
2. If the fix should also appear in other lanes, apply it to each lane's source branch.
3. After the fix is merged, republish the lane from its source branch:

   ```bash
   # Run the lane-aware workflow on main; it checks out maintenance/v3.x to build.
   gh workflow run docs.yml --ref main -f ref=maintenance/v3.x -f lane=v3
   ```

   You can also run the workflow on the maintenance branch itself:

   ```bash
   gh workflow run docs.yml --ref maintenance/v3.x -f ref=maintenance/v3.x -f lane=v3
   ```

For current documentation, merge the fix into `main`. A release republishes both `/` and `/v4/`; to republish without a release, run both lanes:

```bash
gh workflow run docs.yml --ref main -f ref=main -f lane=latest
gh workflow run docs.yml --ref main -f ref=main -f lane=v4
```

Check the workflow run and the target URL after publishing. The version menu and the banner should identify the selected lane. Older lanes should retain `noindex` and have no `sitemap.xml`; only the root lane should contain `CNAME`, `versions.json`, and the sitemap.

## Add a major version

When v5 becomes current, `latest` should follow `main` and `/v5/` should be the pinned major lane. Keep `/v4/` available from a new `maintenance/v4.x` branch. Update these files together:

1. Create `maintenance/v4.x` from the final v4 source and keep its docs build, `DOCS_BASE_URL` handling, version menu, banner, and `noindex` settings. Its release workflow must call its lane-aware `docs.yml` with `lane: v4`, using that branch's package manager and build commands. Do the same for each later maintenance branch.
2. In `.github/workflows/release-please.yml` on `main`, change the branch-to-lanes matrix to map `main` to `["latest", "v5"]` and `maintenance/v4.x` to `["v4"]`. Keep the v3 mapping while v3 is maintained, and include maintained branches in the push trigger. A release on a maintenance branch uses the workflow committed to that branch, so update that branch's release workflow too.
3. Add `v5` to `.github/workflows/docs.yml`'s dispatch choices and root `clean-exclude` list. Keep every published major lane in that list so a root deployment cannot delete it. The generic `DOCS_BASE_URL` expression will use `/v5/` automatically; add a branch-specific build path only if the new branch uses different tooling.
4. Update `docs/static/versions.json`: change the `latest` label, add `/v5/`, and retain maintained older lanes. The navbar reads this file at build time. Copy the manifest to maintained branches so their menus show the new lane; non-root deployments remove the file from their build output, leaving the root copy authoritative.
5. Update `docs/pages/Docs.md` and this guide with the new branch and republish commands. Build each lane, then dispatch it and verify its URL. Confirm `/` and other lane folders still work after publishing the new lane and after republishing `latest`.

The root lane owns the custom domain and sitemap. Major lanes are served from subfolders and are marked `noindex` to avoid indexing duplicate content.
