# Dependency security patches

The October 2026 dependency refresh upgrades russh to 0.64.1 in both Rust
packages and applies compatible npm security releases. Two upstream npm
packages have no released fixes as of 2026-10-21, so existing `patch-package`
installation applies narrowly scoped local patches:

- `braces` 3.0.3: reject nesting beyond 128 levels in the parser and validate
  supplied AST depth iteratively before compile, expand or stringify recursion.
  This adds an explicit input-validation error, consistent with the existing
  input-length/range limits; callers must still handle invalid patterns.
  Ordinary source globs retain their behavior.
  [Upstream issue](https://github.com/micromatch/braces/issues/70).
- `node-forge` 1.4.0: also check the nested DigestAlgorithm element count during
  RSA PKCS#1 v1.5 verification. The exact check is from upstream PR 1152, which
  remains unmerged; this is a local backport, not an upstream released fix.
  [Upstream PR](https://github.com/digitalbazaar/forge/pull/1152).

`npm test` runs regression checks for these patches before the application tests.
The RSA test uses generated test keys, validates normal signatures, and rejects
signed malformed DigestInfo structures. No network or production keys are used.
The brace test covers both string inputs and directly supplied deep ASTs.

Version-only npm scanners will continue reporting GHSA-vfj7-8cjw-p6xm and
GHSA-86w9-cpqp-85rv. Keep the warnings visible: verify patch application and run
`npm run test:security-dependencies`, then replace these patches with official
fixed releases when available. Other remaining advisory warnings must be
reviewed independently; these patches do not waive them.
