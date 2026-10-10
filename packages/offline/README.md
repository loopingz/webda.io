# @webda/offline

Offline replicas of Webda models: clients sync query-scoped sets of objects, edit them offline and push them back.
Conflicts are detected with a per-object revision (`_rev`) and merged client-side with `@webda/versioning`.

- Server: `SyncService` (`@webda/offline`)
- Client: `OfflineClient` (`@webda/offline/client`, runs in browsers, React Native, Electron and Node)

See https://docs.webda.io/pages/Modules/Offline
