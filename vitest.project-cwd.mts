// Setup file added to every project by the root vitest.config.ts.
//
// Specs read fixtures, load applications and spawn commands relative to their package directory,
// which is the working directory when `vitest run` is launched inside a package. Vitest runs each
// spec file in its own child process (forks pool), so each one can move to its package.
process.chdir(process.env.WEBDA_TEST_PROJECT_ROOT);
