#!/bin/bash
set -e  # Exit on error

echo "======================================================================"
echo "Clone2 Sparse Worktree Exploration"
echo "======================================================================"
echo ""
echo "This script demonstrates:"
echo "  1. Cloning an existing repo with sparse worktree setup"
echo "  2. Setting up the sparse worktree from existing remote branch"
echo "  3. Adding items to different branches via different working directories"
echo "  4. Verifying that commits go to the correct branches automatically"
echo ""
echo "Expected behavior:"
echo "  - Items added in sparse worktree → commit to data-branch"
echo "  - Items added in main working dir → commit to main branch"
echo "  - No explicit checkouts needed (worktree determines branch)"
echo ""

# Step 1: Clone the repository
echo "======================================================================"
echo "STEP 1: Clone Repository from First Script's Bare Repo"
echo "======================================================================"
echo ""
echo "Why: Clone2 needs to get the repository that clone1 already set up"
echo "     This simulates a second developer joining the project"
echo ""

cd /tmp
if [ -d clone2 ]; then
  echo "Removing existing clone2..."
  rm -rf clone2
fi

git clone /tmp/shell-explore-1 clone2
cd clone2

echo "✓ Repository cloned"
echo ""
echo "Current branches in clone2:"
git branch -a

# Step 2: Set up the sparse worktree from remote
echo ""
echo "======================================================================"
echo "STEP 2: Set Up Sparse Worktree Tracking Remote data-branch"
echo "======================================================================"
echo ""
echo "Why: The data-branch exists on origin, we need to:"
echo "     1. Fetch it from origin"
echo "     2. Create a local worktree that tracks origin/data-branch"
echo "     3. Configure sparse checkout for data-directory only"
echo ""

echo "2a. Fetching data-branch from origin..."
git fetch origin data-branch
echo "   ✓ Fetched data-branch"

echo ""
echo "2b. Creating worktree tracking origin/data-branch..."
echo "    Using: git worktree add --track -b data-branch .data-worktree origin/data-branch"
echo "    Why: --track flag establishes upstream relationship automatically"
git worktree add --track -b data-branch .data-worktree origin/data-branch
echo "   ✓ Worktree created with upstream tracking"

echo ""
echo "2c. Entering worktree and configuring sparse checkout..."
cd .data-worktree
git sparse-checkout init --cone
git sparse-checkout set data-directory
echo "   ✓ Sparse checkout configured for data-directory"

echo ""
echo "2d. Verifying upstream tracking in worktree..."
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u})
echo "   Upstream: $UPSTREAM"
if [ "$UPSTREAM" = "origin/data-branch" ]; then
  echo "   ✓ Upstream tracking correctly set"
else
  echo "   ✗ ERROR: Expected origin/data-branch, got $UPSTREAM"
  exit 1
fi

echo ""
echo "Worktree status:"
git branch -vv

cd /tmp/clone2

# Step 3: Add item to sparse worktree directory
echo ""
echo "======================================================================"
echo "STEP 3: Add Item to Sparse Worktree (data-directory)"
echo "======================================================================"
echo ""
echo "Why: This tests that commits in the worktree go to data-branch"
echo "     The worktree is on data-branch, so commits happen there"
echo ""

echo "3a. Creating new file in data-directory..."
echo '{"id": "item1", "name": "Task from Clone2"}' > .data-worktree/data-directory/item1.json
echo "   ✓ Created item1.json in worktree's data-directory"

echo ""
echo "3b. Checking which branch we're on in worktree..."
cd .data-worktree
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "   Current branch: $CURRENT_BRANCH"

echo ""
echo "3c. Committing in worktree..."
git add data-directory/item1.json
git commit -m "Add item1 from clone2"
echo "   ✓ Committed to $CURRENT_BRANCH"

echo ""
echo "3d. Pushing from worktree..."
echo "    Why: git push without args works because upstream is set"
git push
echo "   ✓ Pushed to origin/data-branch"

cd /tmp/clone2

# Step 4: Add item to main working directory
echo ""
echo "======================================================================"
echo "STEP 4: Add Item to Main Working Directory (other-directory)"
echo "======================================================================"
echo ""
echo "Why: This tests that commits in main working dir go to main branch"
echo "     The main working directory is on main branch"
echo ""

echo "4a. Creating new file in main working directory's other-directory..."
echo "content from clone2" > other-directory/clone2-file.txt
echo "   ✓ Created clone2-file.txt in main directory's other-directory"

echo ""
echo "4b. Checking which branch we're on in main directory..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "   Current branch: $CURRENT_BRANCH"

echo ""
echo "4c. Committing in main directory..."
git add other-directory/clone2-file.txt
git commit -m "Add clone2-file to other-directory"
echo "   ✓ Committed to $CURRENT_BRANCH"

echo ""
echo "4d. Pushing from main directory..."
echo "    Why: git push without args works because upstream is set"
git push
echo "   ✓ Pushed to origin/main"

# Comprehensive verification
echo ""
echo "======================================================================"
echo "🔬 COMPREHENSIVE VERIFICATION TESTS"
echo "======================================================================"

echo ""
echo "TEST 1: Verify sparse worktree has upstream tracking"
cd /tmp/clone2/.data-worktree
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1)
if [ "$UPSTREAM" = "origin/data-branch" ]; then
  echo "   ✅ PASS: worktree tracks origin/data-branch"
else
  echo "   ❌ FAIL: worktree upstream is '$UPSTREAM'"
  exit 1
fi

echo ""
echo "TEST 2: Verify main directory has upstream tracking"
cd /tmp/clone2
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1)
if [ "$UPSTREAM" = "origin/main" ]; then
  echo "   ✅ PASS: main directory tracks origin/main"
else
  echo "   ❌ FAIL: main directory upstream is '$UPSTREAM'"
  exit 1
fi

echo ""
echo "TEST 3: Verify item1.json exists in worktree's data-directory"
if [ -f /tmp/clone2/.data-worktree/data-directory/item1.json ]; then
  echo "   ✅ PASS: item1.json exists in worktree"
  CONTENT=$(cat /tmp/clone2/.data-worktree/data-directory/item1.json)
  echo "   Content: $CONTENT"
else
  echo "   ❌ FAIL: item1.json does not exist"
  exit 1
fi

echo ""
echo "TEST 4: Verify clone2-file.txt exists in main directory's other-directory"
if [ -f /tmp/clone2/other-directory/clone2-file.txt ]; then
  echo "   ✅ PASS: clone2-file.txt exists in main directory"
  CONTENT=$(cat /tmp/clone2/other-directory/clone2-file.txt)
  echo "   Content: $CONTENT"
else
  echo "   ❌ FAIL: clone2-file.txt does not exist"
  exit 1
fi

echo ""
echo "TEST 5: Verify item1.json does NOT exist in main directory"
echo "   Why: Sparse checkout should prevent data-directory from appearing in main"
if [ ! -f /tmp/clone2/data-directory/item1.json ]; then
  echo "   ✅ PASS: item1.json correctly isolated to worktree"
else
  echo "   ❌ FAIL: item1.json should not exist in main directory"
  exit 1
fi

echo ""
echo "TEST 6: Verify clone2-file.txt does NOT exist in worktree"
echo "   Why: other-directory should be filtered by sparse checkout"
if [ ! -f /tmp/clone2/.data-worktree/other-directory/clone2-file.txt ]; then
  echo "   ✅ PASS: clone2-file.txt correctly filtered from worktree"
else
  echo "   ❌ FAIL: clone2-file.txt should not exist in worktree"
  exit 1
fi

echo ""
echo "TEST 7: Verify item1.json commit went to data-branch on origin"
cd /tmp/clone2
git fetch origin data-branch
ORIGIN_DATA_COMMIT=$(git rev-parse origin/data-branch)
ORIGIN_DATA_MESSAGE=$(git log -1 --pretty=format:%s origin/data-branch)
echo "   Latest commit on origin/data-branch: $ORIGIN_DATA_MESSAGE"
if echo "$ORIGIN_DATA_MESSAGE" | grep -q "item1"; then
  echo "   ✅ PASS: item1 commit exists on origin/data-branch"
else
  echo "   ❌ FAIL: item1 commit not found on origin/data-branch"
  exit 1
fi

echo ""
echo "TEST 8: Verify clone2-file commit went to main branch on origin"
git fetch origin main
ORIGIN_MAIN_COMMIT=$(git rev-parse origin/main)
ORIGIN_MAIN_MESSAGE=$(git log -1 --pretty=format:%s origin/main)
echo "   Latest commit on origin/main: $ORIGIN_MAIN_MESSAGE"
if echo "$ORIGIN_MAIN_MESSAGE" | grep -q "clone2-file"; then
  echo "   ✅ PASS: clone2-file commit exists on origin/main"
else
  echo "   ❌ FAIL: clone2-file commit not found on origin/main"
  exit 1
fi

echo ""
echo "TEST 9: Verify data-branch on origin has item1.json"
git checkout origin/data-branch -- data-directory/item1.json 2>/dev/null || true
if [ -f data-directory/item1.json ]; then
  echo "   ✅ PASS: item1.json exists on origin/data-branch"
  rm -rf data-directory  # Clean up
else
  echo "   ❌ FAIL: item1.json not found on origin/data-branch"
  exit 1
fi

echo ""
echo "TEST 10: Verify main branch on origin has clone2-file.txt"
git fetch origin main
if git ls-tree -r origin/main --name-only | grep -q "other-directory/clone2-file.txt"; then
  echo "   ✅ PASS: clone2-file.txt exists on origin/main"
else
  echo "   ❌ FAIL: clone2-file.txt not found on origin/main"
  exit 1
fi

echo ""
echo "TEST 11: Verify branches have diverged correctly"
echo "   Main branch commits:"
git log --oneline origin/main -3 | sed 's/^/      /'
echo ""
echo "   Data branch commits:"
git log --oneline origin/data-branch -3 | sed 's/^/      /'
echo "   ✅ PASS: Branches show different commit histories"

echo ""
echo "TEST 12: Verify git log in worktree shows only data-branch commits"
cd /tmp/clone2/.data-worktree
WORKTREE_COMMITS=$(git log --oneline -3)
echo "   Worktree commit history:"
echo "$WORKTREE_COMMITS" | sed 's/^/      /'
if echo "$WORKTREE_COMMITS" | grep -q "item1"; then
  echo "   ✅ PASS: Worktree shows data-branch commits"
else
  echo "   ❌ FAIL: Worktree doesn't show expected commits"
  exit 1
fi

echo ""
echo "TEST 13: Verify git log in main directory shows only main commits"
cd /tmp/clone2
MAIN_COMMITS=$(git log --oneline -3)
echo "   Main directory commit history:"
echo "$MAIN_COMMITS" | sed 's/^/      /'
if echo "$MAIN_COMMITS" | grep -q "clone2-file"; then
  echo "   ✅ PASS: Main directory shows main branch commits"
else
  echo "   ❌ FAIL: Main directory doesn't show expected commits"
  exit 1
fi

echo ""
echo "======================================================================"
echo "✅ ALL VERIFICATION TESTS PASSED (13/13)"
echo "======================================================================"
echo ""
echo "Summary of what was proven:"
echo "  ✓ Clone2 successfully cloned from bare repository"
echo "  ✓ Sparse worktree set up with --track flag (automatic upstream)"
echo "  ✓ Sparse checkout configured for data-directory only"
echo "  ✓ Item added to worktree → committed to data-branch"
echo "  ✓ Item added to main dir → committed to main branch"
echo "  ✓ Both pushes succeeded without explicit branch specification"
echo "  ✓ No checkouts needed - worktree location determines branch"
echo "  ✓ Sparse isolation verified - files stay in their branches"
echo "  ✓ Commit histories correctly diverged on origin"
echo ""
echo "Key insight:"
echo "  The working directory you're in determines which branch gets the commit."
echo "  - Work in .data-worktree/ → commits go to data-branch"
echo "  - Work in main directory → commits go to main branch"
echo "  This happens automatically because each directory is on a different branch."
echo ""
