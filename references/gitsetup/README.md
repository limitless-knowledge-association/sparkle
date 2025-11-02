# Git Sparse Worktree Setup Reference Scripts

This directory contains three executable shell scripts that demonstrate and verify the complete git sparse worktree workflow used by Sparkle.

## Purpose

These scripts serve as:
- **Reference implementation** of the correct git command sequence
- **Verification tests** proving the architecture works
- **Learning tools** for understanding sparse worktree with upstream tracking
- **Debugging aids** for troubleshooting git setup issues

## Scripts Overview

### 01-initial-setup.sh
**What it demonstrates:**
- Creating a bare repository (simulates origin)
- Cloning the repository (first developer/clone)
- Setting up main branch with upstream tracking using `git push -u`
- Creating a separate data branch from current commit
- Adding a git worktree for the data branch
- Configuring sparse checkout to only show specific directory
- Pushing data branch with upstream tracking using `git push -u`
- Adding worktree directory to `.gitignore` and committing it

**Key insight:**
The `-u` flag on `git push` is critical for establishing upstream tracking. Once set, `git pull` and `git push` work without arguments.

**Tests:** 15 comprehensive verification tests

### 02-clone2-workflow.sh
**What it demonstrates:**
- Cloning from an existing repository with sparse worktree already configured
- Setting up sparse worktree from remote branch using `git worktree add --track`
- Adding items to the sparse worktree → commits go to data branch
- Adding items to main working directory → commits go to main branch
- Pushing both changes without explicit branch specification
- Verifying that commits automatically route to the correct branch

**Key insight:**
The directory you work in determines which branch gets the commit. No checkouts needed.

**Tests:** 13 comprehensive verification tests

### 03-clone1-pull-verification.sh
**What it demonstrates:**
- Pulling changes in main directory → receives main branch updates
- Pulling changes in worktree directory → receives data branch updates
- Both pulls work with zero additional configuration
- Sparse isolation is maintained (files stay in their respective branches)
- Git status remains clean (no untracked worktree directory)

**Key insight:**
Once upstream tracking is established (in script 1), subsequent pulls require no arguments or configuration.

**Tests:** 12 comprehensive verification tests

## How to Run

### Prerequisites
- Git 2.25+ (for sparse checkout cone mode)
- Bash shell
- Write access to `/tmp` directory

### Running Individual Scripts

Each script is standalone but builds on the previous:

```bash
# Clean environment (if running multiple times)
rm -rf /tmp/shell-explore-1 /tmp/clone1 /tmp/clone2

# Script 1: Initial setup
./references/gitsetup/01-initial-setup.sh

# Script 2: Clone2 workflow (requires script 1 to have run)
./references/gitsetup/02-clone2-workflow.sh

# Script 3: Clone1 pull verification (requires scripts 1 & 2 to have run)
./references/gitsetup/03-clone1-pull-verification.sh
```

### Running All Scripts in Sequence

```bash
# Clean environment
rm -rf /tmp/shell-explore-1 /tmp/clone1 /tmp/clone2

# Run all three scripts
./references/gitsetup/01-initial-setup.sh && \
./references/gitsetup/02-clone2-workflow.sh && \
./references/gitsetup/03-clone1-pull-verification.sh

# If all pass, you'll see:
# ✅ ALL VERIFICATION TESTS PASSED (15/15)
# ✅ ALL VERIFICATION TESTS PASSED (13/13)
# ✅ ALL VERIFICATION TESTS PASSED (12/12)
```

### Viewing Test Artifacts

After running, the test environment remains available for inspection:

```bash
# Bare repository (origin)
ls -la /tmp/shell-explore-1/

# Clone 1 (first developer)
cd /tmp/clone1
git branch -a
git worktree list
ls -la .data-worktree/

# Clone 2 (second developer)
cd /tmp/clone2
git branch -a
git worktree list
ls -la .data-worktree/
```

## What These Scripts Prove

### 1. Sparse Checkout Behavior
- **Filters directories, not root files**
- Root-level files from the branch always appear in the worktree
- Only specified directories are checked out
- Other directories are completely filtered out

### 2. Upstream Tracking
- Established with `git push -u origin <branch>`
- Or with `git worktree add --track -b <branch> <path> origin/<branch>`
- Once set, `git pull` and `git push` work without arguments
- Each working directory can have different upstream branches

### 3. Branch Isolation
- Main working directory is on `main` branch
- Worktree directory is on `data-branch`
- Commits automatically go to the correct branch based on directory
- No explicit `git checkout` needed

### 4. Multi-Clone Synchronization
- Changes from clone2 appear in clone1 via simple `git pull`
- Sparse isolation is maintained across clones
- Each clone can independently work on different branches
- Origin repository coordinates all changes

### 5. Clean Git Status
- Worktree directory in `.gitignore` prevents untracked warnings
- Both working directories show clean status after pulls
- No manual cleanup or configuration needed

## Architecture Alignment

These scripts implement the git architecture documented in:
- `docs/git_architecture.md` - Overall git strategy
- Standard git sparse worktree best practices
- Upstream tracking conventions

Key differences from documentation:
- Documentation shows `git push origin HEAD` (works but doesn't set upstream)
- Scripts use `git push -u origin <branch>` (sets upstream for future pulls)
- This is the **correct** approach for multi-clone workflows

## Common Issues and Solutions

### Issue: "fatal: ambiguous argument 'origin/data-branch'"
**Cause:** Upstream tracking not established
**Solution:** Use `git push -u` on first push, or `git branch --set-upstream-to=origin/data-branch`

### Issue: ".data-worktree/" shows as untracked
**Cause:** Missing from `.gitignore`
**Solution:** Add `.data-worktree/` to `.gitignore` and commit (script 1 does this)

### Issue: "git pull" asks which branch to pull
**Cause:** No upstream tracking configured
**Solution:** Ensure `git push -u` was used, or manually set with `git branch --set-upstream-to`

### Issue: Wrong files appear in worktree
**Cause:** Sparse checkout not configured or configured incorrectly
**Solution:**
```bash
cd .data-worktree
git sparse-checkout init --cone
git sparse-checkout set <directory-name>
```

## Test Breakdown

### Total Tests: 40

**Script 1 (15 tests):**
- Upstream tracking verification (main & data branches)
- Worktree configuration
- Sparse checkout configuration
- File isolation (sparse filtering)
- `.gitignore` configuration
- Git status cleanliness
- Origin synchronization
- Pull/push functionality

**Script 2 (13 tests):**
- Clone setup and tracking
- Branch routing (commits to correct branches)
- File isolation (cross-branch)
- Origin synchronization
- Commit history divergence
- Sparse filtering verification

**Script 3 (12 tests):**
- Pull operations in both directories
- File synchronization
- Sparse isolation maintenance
- Git status cleanliness
- Upstream tracking functionality
- Complete synchronization across all clones

## Success Criteria

When all scripts pass:
- ✅ 40/40 tests passed
- ✅ All git operations work without manual configuration
- ✅ Sparse isolation is maintained
- ✅ Multi-clone workflow is verified
- ✅ Ready to apply this architecture to production code

## Next Steps

After understanding these scripts:
1. Review `src/gitBranchOps.js` for production implementation
2. Compare production code to script commands
3. Identify any discrepancies (especially around upstream tracking)
4. Update production code to match the verified script approach
5. Run integration tests to verify production changes

## References

- [Git Worktree Documentation](https://git-scm.com/docs/git-worktree)
- [Git Sparse Checkout Documentation](https://git-scm.com/docs/git-sparse-checkout)
- [Git Branch Tracking](https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches)
- `docs/git_architecture.md` - Sparkle's git architecture

---

**Last Updated:** Based on exploration session that identified upstream tracking gap in production code.
**Status:** All scripts passing (40/40 tests)
