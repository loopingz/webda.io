# Changelog

## [4.0.0-beta.6](https://github.com/loopingz/webda.io/compare/ql-v4.0.0-beta.5...ql-v4.0.0-beta.6) (2026-10-09)


### ⚠ BREAKING CHANGES

* **ql:** DELETE, UPDATE, SELECT, SET and WHERE are reserved uppercase keywords; Query.type is required; parse().toString() prints the canonical query instead of the source tokens; the root parse rule is now `(statement | filterQuery) EOF` for code walking the ANTLR tree.

### Features

* **ql:** WebdaQL DELETE/UPDATE/SELECT statements, bulk deleteMany/updateMany, filter-only Query operations ([#818](https://github.com/loopingz/webda.io/issues/818)) ([add9503](https://github.com/loopingz/webda.io/commit/add95031aff982cd69a635c519b4ddaa6874ecbe))
* store-agnostic aggregations (Model.aggregate, SELECT … GROUP BY) ([#820](https://github.com/loopingz/webda.io/issues/820)) ([9eca947](https://github.com/loopingz/webda.io/commit/9eca947fdd0cbf456690cb61c9a30c66c22be1ad))


### Bug Fixes

* **ql:** break aggregation/query circular import ([#822](https://github.com/loopingz/webda.io/issues/822)) ([6e96fa4](https://github.com/loopingz/webda.io/commit/6e96fa434004504abeb6bab66a744bdd987bdaf0))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.6

## [4.0.0-beta.5](https://github.com/loopingz/webda.io/compare/ql-v4.0.0-beta.3...ql-v4.0.0-beta.5) (2026-10-08)


### Bug Fixes

* **packaging:** point every package's repository at its monorepo folder ([#812](https://github.com/loopingz/webda.io/issues/812)) ([3717b73](https://github.com/loopingz/webda.io/commit/3717b73c7a7b91348057d84c8e64ecf840c75cb1))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.5

## [4.0.0-beta.3](https://github.com/loopingz/webda.io/compare/ql-v4.0.0-beta.1...ql-v4.0.0-beta.3) (2026-10-05)


### ⚠ BREAKING CHANGES

* @webda/ts-plugin and the `tsc-esm` binary are removed, and applications now build with TypeScript 7.1. Generated code changes where TypeScript 6 was wrong, each verified against the shipped output:
    - AuditEntry.timestamp, declared `number`, is no longer coerced to Date;
    - AbstractOwnerModel no longer emits `new ModelLink(T)`, a ReferenceError
      on first raw-uuid assignment;
    - sample-app's `User extends WebdaUser` is now treated as a model (TS6's
      base-chain guard was keyed on class name), so its relations are
      initialised and coerced;
    - imports use the specifier the author wrote, not monorepo-relative paths
      that only resolve inside this repository;
    - the emitted .d.ts is valid (TS6 referenced PrimaryKeyType unimported and
      wrote BelongTo without its type argument).
    A build that cannot write its module now fails; under TS6 a strict
    file-naming violation was logged and the build still reported success.
* remove node 18 support
* remove expose for Store

### Features

* add codemod system ([bbc3086](https://github.com/loopingz/webda.io/commit/bbc3086c1bd4e5c9a7ec9a2ed14772cd8edbf477))
* add formatting for context ([54dee1e](https://github.com/loopingz/webda.io/commit/54dee1e09da052c5daba778bc45bccff15d033f4))
* build on TypeScript 7.1; delete @webda/ts-plugin and ts-patch ([0008e97](https://github.com/loopingz/webda.io/commit/0008e97919524d44528a8e3e89ee27cfaa2ee93b))
* move to node 22 ([21daf46](https://github.com/loopingz/webda.io/commit/21daf46c54d4e3912ad1b545e1ce89b9a6a84c35))
* move to pnpm and disable many modules for now ([ea953b7](https://github.com/loopingz/webda.io/commit/ea953b7faaa47d70bc8136b39e9a3d3336655214))
* **ql:** bind ? and :name query parameters ([#788](https://github.com/loopingz/webda.io/issues/788)) ([4a8647b](https://github.com/loopingz/webda.io/commit/4a8647bb9e8e7eedb1aeadf5e5bc77749437b440))
* **ql:** support IS NULL and IS NOT NULL ([553d143](https://github.com/loopingz/webda.io/commit/553d143b8513c309ca93f9b071b4029ca2649f5f))
* **ql:** TRUE and FALSE as expressions ([9116440](https://github.com/loopingz/webda.io/commit/91164406b59ee7f811b6d7db783cac89cd3ac45b))
* remove expose for Store ([c8a36b1](https://github.com/loopingz/webda.io/commit/c8a36b19c81b830e9c03195388b402e53f987e6e))
* remove node 18 support ([44e7de2](https://github.com/loopingz/webda.io/commit/44e7de29fbc40df9cfb9a707f58bc08d421a3ac1))
* update watchers on service parameter on update ([f3417d7](https://github.com/loopingz/webda.io/commit/f3417d7004babaa6718012a68383bf19301a85fa))
* WebdaQLString&lt;T&gt; branded type + ts-plugin compile-time validator ([#772](https://github.com/loopingz/webda.io/issues/772)) ([f0c14c1](https://github.com/loopingz/webda.io/commit/f0c14c1d5511b6f5e4f52633a23b3d2fe07b86c1))


### Bug Fixes

* prepend query now use WebdaQL parser ([#681](https://github.com/loopingz/webda.io/issues/681)) ([b640244](https://github.com/loopingz/webda.io/commit/b6402441096975861ac222b682bf8ae17ba3a36d))
* **ql:** escape backslashes in WebdaQL string literals ([6de215b](https://github.com/loopingz/webda.io/commit/6de215b082ad99eaea7c094f470cd81b30eac71d))
* **ql:** LIKE on a missing attribute no longer throws ([b66cade](https://github.com/loopingz/webda.io/commit/b66cade2e2773ac88731efa3b4233573ef2e96d3))
* **ql:** rewrite interpolated null values to IS NULL / IS NOT NULL ([bf7697b](https://github.com/loopingz/webda.io/commit/bf7697b84ed55042911f5469d098f1a2ca94f70f))
* **ql:** unescape quoted string literals ([4cecfbc](https://github.com/loopingz/webda.io/commit/4cecfbc6e2db8fdaf709c0acf5d193d875f5fb12))
* unit test models relations ([2d160f1](https://github.com/loopingz/webda.io/commit/2d160f18d2139b362e8a12f935e15eaad27a808a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/test bumped to 4.0.0-beta.3

## 4.0.0-beta.1 (2024-08-14)


### Features

* separate WebdaQL module ([69beabb](https://github.com/loopingz/webda.io/commit/69beabb0d1715ab81636338509539ade89c07c6a))


### Continuous Integration

* update additional modules ([77b32e9](https://github.com/loopingz/webda.io/commit/77b32e9dbd950ddaebe11cda22c20d71ab7f309a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @webda/tsc-esm bumped from ^1.3.0 to ^4.0.0-beta.1
