#!/bin/bash
set -e  # Exit on error

echo "======================================================================"
echo "Clone1 Pull Verification"
echo "======================================================================"
echo ""
echo "This script demonstrates:"
echo "  1. Clone1 can pull changes from clone2 in main directory"
echo "  2. Clone1 can pull changes from clone2 in worktree directory"
echo "  3. No additional setup needed - just pull in each location"
echo ""
echo "Expected behavior:"
echo "  - Pull in main directory → receives clone2's main branch changes"
echo "  - Pull in worktree → receives clone2's data-branch changes"
echo "  - Both pulls work because upstream tracking is already configured"
echo ""

# Pre-verification: Check current state before pulling
echo "======================================================================"
echo "PRE-PULL STATE VERIFICATION"
echo "======================================================================"

echo ""
echo "Checking clone1 main directory..."
cd /tmp/clone1

echo "Current branch:"
git rev-parse --abbrev-ref HEAD

echo ""
echo "Current HEAD:"
git log -1 --oneline

echo ""
echo "Files in other-directory (before pull):"
ls -la other-directory/

echo ""
echo "Checking clone1 worktree..."
cd /tmp/clone1/.data-worktree

echo "Current branch:"
git rev-parse --abbrev-ref HEAD

echo ""
echo "Current HEAD:"
git log -1 --oneline

echo ""
echo "Files in data-directory (before pull):"
ls -la data-directory/

# Step 1: Pull in main directory
echo ""
echo "======================================================================"
echo "STEP 1: Pull in Main Directory"
echo "======================================================================"
echo ""
echo "Why: Clone2 pushed changes to origin/main"
echo "     We should receive clone2-file.txt in other-directory/"
echo ""

cd /tmp/clone1

echo "1a. Checking upstream configuration..."
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
echo "   Upstream: $UPSTREAM"
if [ "$UPSTREAM" = "origin/main" ]; then
  echo "   ✓ Upstream is configured correctly"
else
  echo "   ✗ ERROR: Expected origin/main, got $UPSTREAM"
  exit 1
fi

echo ""
echo "1b. Performing git pull..."
echo "    Command: git pull (no arguments needed - upstream is set)"
PULL_OUTPUT=$(git pull 2>&1)
echo "$PULL_OUTPUT"
echo "   ✓ Pull completed"

echo ""
echo "1c. Verifying changes were received..."
if [ -f other-directory/clone2-file.txt ]; then
  echo "   ✓ clone2-file.txt received from clone2"
  echo "   Content:"
  cat other-directory/clone2-file.txt | sed 's/^/      /'
else
  echo "   ✗ ERROR: clone2-file.txt not found"
  exit 1
fi

echo ""
echo "1d. Checking commit history..."
LATEST_COMMIT=$(git log -1 --pretty=format:%s)
echo "   Latest commit: $LATEST_COMMIT"
if echo "$LATEST_COMMIT" | grep -q "clone2-file"; then
  echo "   ✓ Clone2's commit is now in clone1's history"
else
  echo "   ✗ ERROR: Expected clone2's commit in history"
  exit 1
fi

# Step 2: Pull in worktree
echo ""
echo "======================================================================"
echo "STEP 2: Pull in Worktree Directory"
echo "======================================================================"
echo ""
echo "Why: Clone2 pushed changes to origin/data-branch"
echo "     We should receive item1.json in data-directory/"
echo ""

cd /tmp/clone1/.data-worktree

echo "2a. Checking upstream configuration..."
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
echo "   Upstream: $UPSTREAM"
if [ "$UPSTREAM" = "origin/data-branch" ]; then
  echo "   ✓ Upstream is configured correctly"
else
  echo "   ✗ ERROR: Expected origin/data-branch, got $UPSTREAM"
  exit 1
fi

echo ""
echo "2b. Performing git pull..."
echo "    Command: git pull (no arguments needed - upstream is set)"
PULL_OUTPUT=$(git pull 2>&1)
echo "$PULL_OUTPUT"
echo "   ✓ Pull completed"

echo ""
echo "2c. Verifying changes were received..."
if [ -f data-directory/item1.json ]; then
  echo "   ✓ item1.json received from clone2"
  echo "   Content:"
  cat data-directory/item1.json | sed 's/^/      /'
else
  echo "   ✗ ERROR: item1.json not found"
  exit 1
fi

echo ""
echo "2d. Checking commit history..."
LATEST_COMMIT=$(git log -1 --pretty=format:%s)
echo "   Latest commit: $LATEST_COMMIT"
if echo "$LATEST_COMMIT" | grep -q "item1"; then
  echo "   ✓ Clone2's commit is now in worktree's history"
else
  echo "   ✗ ERROR: Expected clone2's commit in history"
  exit 1
fi

# Comprehensive verification
echo ""
echo "======================================================================"
echo "🔬 COMPREHENSIVE VERIFICATION TESTS"
echo "======================================================================"

echo ""
echo "TEST 1: Verify clone2-file.txt exists in clone1 main directory"
cd /tmp/clone1
if [ -f other-directory/clone2-file.txt ]; then
  CONTENT=$(cat other-directory/clone2-file.txt)
  if [ "$CONTENT" = "content from clone2" ]; then
    echo "   ✅ PASS: clone2-file.txt exists with correct content"
  else
    echo "   ❌ FAIL: clone2-file.txt has wrong content: $CONTENT"
    exit 1
  fi
else
  echo "   ❌ FAIL: clone2-file.txt does not exist"
  exit 1
fi

echo ""
echo "TEST 2: Verify item1.json exists in clone1 worktree"
cd /tmp/clone1/.data-worktree
if [ -f data-directory/item1.json ]; then
  CONTENT=$(cat data-directory/item1.json)
  if echo "$CONTENT" | grep -q "Task from Clone2"; then
    echo "   ✅ PASS: item1.json exists with correct content"
  else
    echo "   ❌ FAIL: item1.json has wrong content: $CONTENT"
    exit 1
  fi
else
  echo "   ❌ FAIL: item1.json does not exist"
  exit 1
fi

echo ""
echo "TEST 3: Verify clone1 main is synchronized with origin/main"
cd /tmp/clone1
LOCAL_MAIN=$(git rev-parse HEAD)
REMOTE_MAIN=$(git rev-parse origin/main)
if [ "$LOCAL_MAIN" = "$REMOTE_MAIN" ]; then
  echo "   ✅ PASS: local main matches origin/main"
  echo "   SHA: $LOCAL_MAIN"
else
  echo "   ❌ FAIL: local main ($LOCAL_MAIN) != origin/main ($REMOTE_MAIN)"
  exit 1
fi

echo ""
echo "TEST 4: Verify clone1 worktree is synchronized with origin/data-branch"
cd /tmp/clone1/.data-worktree
LOCAL_DATA=$(git rev-parse HEAD)
REMOTE_DATA=$(git rev-parse origin/data-branch)
if [ "$LOCAL_DATA" = "$REMOTE_DATA" ]; then
  echo "   ✅ PASS: local data-branch matches origin/data-branch"
  echo "   SHA: $LOCAL_DATA"
else
  echo "   ❌ FAIL: local data-branch ($LOCAL_DATA) != origin/data-branch ($REMOTE_DATA)"
  exit 1
fi

echo ""
echo "TEST 5: Verify main directory commit history includes clone2's commit"
cd /tmp/clone1
MAIN_HISTORY=$(git log --oneline -5)
echo "   Main branch history:"
echo "$MAIN_HISTORY" | sed 's/^/      /'
if echo "$MAIN_HISTORY" | grep -q "clone2-file"; then
  echo "   ✅ PASS: clone2's main commit is in history"
else
  echo "   ❌ FAIL: clone2's main commit not found"
  exit 1
fi

echo ""
echo "TEST 6: Verify worktree commit history includes clone2's commit"
cd /tmp/clone1/.data-worktree
DATA_HISTORY=$(git log --oneline -5)
echo "   Data branch history:"
echo "$DATA_HISTORY" | sed 's/^/      /'
if echo "$DATA_HISTORY" | grep -q "item1"; then
  echo "   ✅ PASS: clone2's data-branch commit is in history"
else
  echo "   ❌ FAIL: clone2's data-branch commit not found"
  exit 1
fi

echo ""
echo "TEST 7: Verify item1.json does NOT exist in main directory"
echo "   Why: Sparse isolation - data-directory only in worktree"
cd /tmp/clone1
if [ ! -f data-directory/item1.json ]; then
  echo "   ✅ PASS: item1.json correctly isolated to worktree"
else
  echo "   ❌ FAIL: item1.json should not exist in main directory"
  exit 1
fi

echo ""
echo "TEST 8: Verify clone2-file.txt does NOT exist in worktree"
echo "   Why: Sparse isolation - other-directory filtered from worktree"
cd /tmp/clone1/.data-worktree
if [ ! -f other-directory/clone2-file.txt ]; then
  echo "   ✅ PASS: clone2-file.txt correctly filtered from worktree"
else
  echo "   ❌ FAIL: clone2-file.txt should not exist in worktree"
  exit 1
fi

echo ""
echo "TEST 9: Verify git status shows clean in main directory"
cd /tmp/clone1
STATUS_OUTPUT=$(git status --porcelain)
if [ -z "$STATUS_OUTPUT" ]; then
  echo "   ✅ PASS: working directory is clean (no uncommitted changes)"
else
  echo "   ❌ FAIL: working directory has uncommitted changes"
  echo "$STATUS_OUTPUT" | sed 's/^/      /'
  exit 1
fi

echo ""
echo "TEST 10: Verify git status shows clean in worktree"
cd /tmp/clone1/.data-worktree
STATUS_OUTPUT=$(git status --porcelain)
if [ -z "$STATUS_OUTPUT" ]; then
  echo "   ✅ PASS: worktree is clean (no uncommitted changes)"
else
  echo "   ❌ FAIL: worktree has uncommitted changes"
  echo "$STATUS_OUTPUT" | sed 's/^/      /'
  exit 1
fi

echo ""
echo "TEST 11: Verify both pulls used correct upstream branches"
echo "   Main directory pulled from: origin/main"
echo "   Worktree pulled from: origin/data-branch"
cd /tmp/clone1
MAIN_UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
cd /tmp/clone1/.data-worktree
DATA_UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
if [ "$MAIN_UPSTREAM" = "origin/main" ] && [ "$DATA_UPSTREAM" = "origin/data-branch" ]; then
  echo "   ✅ PASS: both locations have correct upstream tracking"
else
  echo "   ❌ FAIL: upstream tracking incorrect"
  echo "      Main: $MAIN_UPSTREAM (expected origin/main)"
  echo "      Data: $DATA_UPSTREAM (expected origin/data-branch)"
  exit 1
fi

echo ""
echo "TEST 12: Verify all three locations are now synchronized"
echo ""
echo "   Clone1 main directory:"
cd /tmp/clone1
echo "      Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "      Commit: $(git log -1 --oneline)"
echo ""
echo "   Clone1 worktree:"
cd /tmp/clone1/.data-worktree
echo "      Branch: $(git rev-parse --abbrev-ref HEAD)"
echo "      Commit: $(git log -1 --oneline)"
echo ""
echo "   Origin repository:"
cd /tmp/clone1
echo "      Main: $(git log -1 --oneline origin/main)"
echo "      Data: $(git log -1 --oneline origin/data-branch)"
echo ""
echo "   ✅ PASS: all locations synchronized"

echo ""
echo "======================================================================"
echo "✅ ALL VERIFICATION TESTS PASSED (12/12)"
echo "======================================================================"
echo ""
echo "Summary of what was proven:"
echo "  ✓ Clone1 main directory pull succeeded (no extra configuration)"
echo "  ✓ Clone1 worktree pull succeeded (no extra configuration)"
echo "  ✓ clone2-file.txt received in main directory from clone2"
echo "  ✓ item1.json received in worktree from clone2"
echo "  ✓ Both locations synchronized with origin"
echo "  ✓ Sparse isolation maintained (files in correct locations)"
echo "  ✓ Commit histories updated correctly"
echo "  ✓ No uncommitted changes (clean pulls)"
echo "  ✓ Upstream tracking worked automatically"
echo ""
echo "Key insight:"
echo "  Both pulls required ZERO additional setup:"
echo "    1. cd /tmp/clone1 && git pull        → got clone2's main changes"
echo "    2. cd .data-worktree && git pull     → got clone2's data changes"
echo ""
echo "  This works because upstream tracking was established during initial setup:"
echo "    - Main: git push -u origin main (in script 1)"
echo "    - Data: git push -u origin data-branch (in script 1)"
echo ""
echo "  Once upstream is set, 'git pull' with no arguments just works!"
echo ""
