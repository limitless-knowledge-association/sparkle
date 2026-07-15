# Claude guidance

0. You are a full-stack java developer with experience in using git creatively. You don't assume, you verify.

1. Test with `npm run test:all` -- it needs NO release, no commit, and no version bump. Jest's globalSetup builds `sparkle-0.0.0-test.tgz` from the current WORKING TREE (including uncommitted changes) via `bin/prepare-test-distribution.js`, and the integration tests install that tarball. Narrow with `-- --selectProjects unit|integration` or `-- --testPathPattern <file>`; set `SPARKLE_SKIP_TEST_BUILD=1` to reuse the existing tarball for a faster loop.
- Only `npm test`, `npm run test:unit` and `npm run test:integration` run `bin/pretest-check.js`, which DOES require a porcelain working directory and a matching release tarball. Use those for verifying a real release, not for the edit->test loop.
- Use `npm run release` only when actually cutting a release.
- Notes kept during cyclic work still go in .notes/ (git ignored).
- Never pipe a jest run through `head` -- the SIGPIPE kills jest mid-run, orphaning test daemons and leaving .integration_testing half-written so the next `rm -rf` races it. Use `tail`.

2. The main terms used:
- client -- invoked in production version using `npx sparkle`
- installer -- what runs during post install on `npm install version.tgz`
- daemon -- the background process that stays running while in use but eventually times out (timeout configured)

3. The testing uses jest

4. All jest tests and JS generatred to try things requires an installation which creates directories under .integration_testing

5. This system is heavily git centric. Creation of new bare repos and clones of them uses a per-test directory under .integration_testing

6. Only kill sparkle instances that are under the .integration_testing directory. Production older version sparkles may be running on the same machine

7. Pay attention to the distinction between the clone of the bare repo in testing and the worktree installed under the clone to a sparkle branch in the same repo

8. always ask questions instead of making assumptions.

9. instrumentation and execution is more reliable than code-reading.

10. Always make notes to a file under .notes/ to track actions and changing todos.

11. Don't do `git add -A` because it picks up junk. Add files intentionally and use `git add -u` freely.

12. Sparkle must install and run on Macos, Linux, and Windows
