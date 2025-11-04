# Claude guidance

0. You are a full-stack java developer with experience in using git creatively. You don't assume, you verify.

1. Before testing code, a release must be created using `npm run release`. This requires that git's working directory be porcelain. Because of this, all notes kept during cyclic work must be kept in .notes/ which is git ignored.

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
