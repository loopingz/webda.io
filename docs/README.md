# Webda.io Docs

This repository contains the documentation for the Webda.io project.
It is built using [Docusaurus 3](https://v3.docusaurus.io/), a modern static website generator.

We might want to explore using this module: https://github.com/jean-humann/docs-to-pdf to generate the PDF version

## Tutorial model diagrams

The blog overview uses `src/components/BlogModelSchema` to display the editable vector artwork in
`static/img/tutorials/blog-model-schema.svg`. The SVG has an accessible title and relationship description;
the component supplies image alternative text, a full-size link, and a responsive image that scales to small screens.

Keep the relationships aligned with `sample-apps/blog-system/src/models/`: a user authors posts and comments,
posts have comments, `PostTag` joins posts and tags, and `UserFollow` connects the follower and following user roles.
The diagram describes associations, not class inheritance. Model labels face the reader; icons sit directly on the isometric jigsaw surfaces, without separate platforms.
The extruded jigsaw pieces reuse the canonical `JIGSAW_PATH` from
`src/components/WebdaJigsaw.tsx`; preserve that outline when editing the diagram. No animation or WebGL runtime is required.

The SVG canvas is transparent. Its text and relationship colors use `prefers-color-scheme`; the image
wrapper sets `color-scheme` from Docusaurus’s `data-theme` so the site toggle also updates the artwork.

## Service lifecycle diagram

`src/components/ServiceLifecycle` displays `static/img/concepts/service-lifecycle.svg` on the Services page.
One Webda jigsaw represents a single service instance; the numbered sequence distinguishes configuration,
synchronous construction/resolution, asynchronous initialization, execution, and resource cleanup.
The static view explains the entire sequence without playback. Keep the hook descriptions aligned with
`packages/core/src/services/service.ts` and `packages/core/src/core/core.ts`.

Both diagrams share `src/components/DiagramFigure` for theme selection, alternative text, a full-size link,
and proportional sizing on small screens. Keep text horizontal and legible in both themes; avoid encoding lifecycle timing as
arbitrary dates or lengths.

## Dynamic configuration diagram

`src/components/ConfigurationFlow` displays `static/img/concepts/configuration-service.svg` on the
Configuration Service page. It shows notification and polling triggers converging on the same read,
merge, compare, decrypt, and apply pipeline, including the unchanged-value path.
Keep behavior aligned with `packages/core/src/configurations/configuration.service.ts` and
`Core.updateConfiguration` in `packages/core/src/core/core.ts`: updates load changed parameters,
not a full service restart. The diagram uses the shared `DiagramFigure` and canonical jigsaw outline.

## Service events diagram

`src/components/ServiceEvents` displays `static/img/concepts/service-events.svg` on the Events page.
The diagram separates listener registration from delivery through AsyncEvents, a queue, and its worker.
Keep the enqueue/completion boundary aligned with `packages/async/src/services/asyncevents.service.ts`
and `Service.emit`: awaiting the queue-send listener does not await the worker's original callbacks.
It reuses the transparent, theme-aware `DiagramFigure` and canonical jigsaw outline.

## Documentation presentation

- The sidebar groups existing routes into Learn, Build, Run & deploy, Modules, Reference, and Migration. Add new top-level directories to `sidebars.js` so they stay discoverable.
- Start guides with an outcome and prerequisites; explain when to use a feature and end with relevant next steps. The Quick Start, Events, and Configuration Service pages demonstrate the structure.
- Use standard Docusaurus `:::tip`, `:::info`, and `:::warning` callouts with descriptive titles. Their icons and labels accompany the Webda colors.
- JSONC examples use the comment-aware JSON grammar while retaining their JSONC label. Code fences retain Docusaurus copy, highlighting, line highlighting (`{2}`), and filename (`title="file.ts"`) support. The CodeBlock wrapper adds a language header and folds examples over 35 lines. Use `Tabs`/`TabItem` with `groupId="package-manager"` for equivalent commands.
- `DiagramFigure` scales artwork to the page and opens a native modal dialog with zoom, scroll/swipe, keyboard focus handling, and Escape dismissal. Keep the original image link as a fallback.
- Article pages retain the animated Webda jigsaw band behind the page introduction.

`ClientCertificateFlow` illustrates native and trusted-proxy certificate entry paths, followed by the login-mode identity flow. Keep its trust and factor-mode notes aligned with the Client Certificate page.

`ConfigurationSecretsFlow` replaces the PKI deployment flow with an explicit repository/runtime separation.
`SealedFieldKeys` distinguishes wrapping keys, the encrypted private-key keyring, public keys, and sealed envelopes.
These diagrams summarize the surrounding documentation; preserve its exact algorithm, recovery, and threat-model details when editing them.
