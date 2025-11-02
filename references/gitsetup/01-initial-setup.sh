#!/bin/bash
set -e  # Exit on error

echo "======================================================================"
echo "Sparkle Worktree Setup Exploration"
echo "======================================================================"

# Cleanup if exists
echo ""
echo "🧹 Cleaning up existing test directories..."
rm -rf /tmp/shell-explore-1
rm -rf /tmp/clone1

# 1. Create bare repo
echo ""
echo "📦 Step 1: Creating bare repository..."
git init --bare /tmp/shell-explore-1
echo "   ✓ Bare repo created at /tmp/shell-explore-1"

# 2. Create clone
echo ""
echo "📥 Step 2: Cloning repository..."
cd /tmp
git clone /tmp/shell-explore-1 clone1
echo "   ✓ Clone created at /tmp/clone1"

# 3. Enter clone1
echo ""
echo "📂 Step 3: Entering clone1..."
cd /tmp/clone1
echo "   ✓ Current directory: $(pwd)"

# 4. Touch x
echo ""
echo "📝 Step 4: Creating file 'x'..."
touch x
echo "   ✓ File 'x' created"

# 5. Add x
echo ""
echo "➕ Step 5: Adding file to git..."
git add x
echo "   ✓ File 'x' staged"

# 6. Commit
echo ""
echo "💾 Step 6: Committing..."
git commit -m "Initial commit"
echo "   ✓ Committed"

# 7. Create a test directory that should be filtered by sparse checkout
echo ""
echo "📁 Step 7a: Creating test directory 'other-directory' (should be filtered)..."
mkdir other-directory
echo "test" > other-directory/test.txt
git add other-directory
git commit -m "Add other-directory for sparse checkout test"
echo "   ✓ Test directory created and committed"

# 7. Push and establish upstream
echo ""
echo "📤 Step 7b: Pushing with upstream tracking..."
git push -u origin main
echo "   ✓ Pushed to origin with upstream tracking"

# 8. Prove upstream is setup
echo ""
echo "🔍 Step 8: Verifying upstream tracking..."
echo "   Current branch:"
git branch -vv
echo ""
echo "   Upstream reference:"
git rev-parse --abbrev-ref --symbolic-full-name @{u}
echo "   ✓ Upstream tracking verified"

# 9. Echo creating worktree
echo ""
echo "======================================================================"
echo "🌲 CREATING WORKTREE"
echo "======================================================================"

# Now add the complete sparse worktree setup based on documentation

# Step 10: Create the data branch from current HEAD
echo ""
echo "🌿 Step 10: Creating 'data-branch' from current commit..."
CURRENT_SHA=$(git rev-parse HEAD)
git branch data-branch $CURRENT_SHA
echo "   ✓ Branch 'data-branch' created from $CURRENT_SHA"

# Step 11: Add the worktree for the local branch
echo ""
echo "📁 Step 11: Adding worktree for 'data-branch'..."
git worktree add .data-worktree data-branch
echo "   ✓ Worktree added at .data-worktree"

# Step 12: Enter the worktree
echo ""
echo "📂 Step 12: Entering worktree..."
cd .data-worktree
echo "   ✓ Current directory: $(pwd)"

# Step 13: Enable sparse checkout
echo ""
echo "🌲 Step 13: Enabling sparse checkout (cone mode)..."
git sparse-checkout init --cone
echo "   ✓ Sparse checkout initialized"

# Step 14: Configure sparse directory
echo ""
echo "📋 Step 14: Configuring sparse checkout for 'data-directory'..."
git sparse-checkout set data-directory
echo "   ✓ Sparse checkout configured for 'data-directory'"

# Step 15: Create the data directory
echo ""
echo "📁 Step 15: Creating 'data-directory'..."
mkdir -p data-directory
echo "   ✓ Directory created"

# Step 16: Create sampledata.json
echo ""
echo "📝 Step 16: Creating sampledata.json..."
echo '{}' > data-directory/sampledata.json
echo "   ✓ File created with content: {}"

# Step 17: Add and commit
echo ""
echo "💾 Step 17: Committing data-directory..."
git add -A
git commit -m "Initialize data-directory with sampledata.json"
echo "   ✓ Committed"

# Step 18: Push with upstream tracking
echo ""
echo "📤 Step 18: Pushing data-branch with upstream tracking..."
git push -u origin data-branch
echo "   ✓ Pushed with upstream tracking"

# Step 19: Verify upstream tracking in worktree
echo ""
echo "🔍 Step 19: Verifying upstream tracking in worktree..."
echo "   Current branch:"
git branch -vv
echo ""
echo "   Upstream reference:"
git rev-parse --abbrev-ref --symbolic-full-name @{u}
echo "   ✓ Upstream tracking verified"

# Step 20: Verify sparse checkout
echo ""
echo "🌲 Step 20: Verifying sparse checkout configuration..."
echo "   Sparse checkout list:"
git sparse-checkout list
echo "   ✓ Sparse checkout verified"

# Step 21: Return to clone1 and add worktree to .gitignore
echo ""
echo "↩️  Step 21: Returning to clone1..."
cd /tmp/clone1
echo "   ✓ Current directory: $(pwd)"

# Step 22: Add .data-worktree to .gitignore
echo ""
echo "📝 Step 22: Adding .data-worktree/ to .gitignore..."
echo "   Why: Worktree directory should not be tracked in main repository"
echo ".data-worktree/" >> .gitignore
echo "   ✓ Added to .gitignore"

# Step 23: Commit .gitignore
echo ""
echo "💾 Step 23: Committing .gitignore to main branch..."
git add .gitignore
git commit -m "Add .data-worktree to .gitignore"
echo "   ✓ Committed"

# Step 24: Push .gitignore change
echo ""
echo "📤 Step 24: Pushing .gitignore change to origin..."
git push
echo "   ✓ Pushed to origin/main"

# Final verification
echo ""
echo "======================================================================"
echo "✅ FINAL VERIFICATION"
echo "======================================================================"

echo ""
echo "📊 Main repository status:"
echo "   Location: $(pwd)"
echo "   Branches:"
git branch -a
echo ""
echo "   Worktrees:"
git worktree list

echo ""
echo "📊 Worktree status:"
echo "   Location: $(pwd)/.data-worktree"
echo "   Branch:"
cd .data-worktree && git branch -vv && cd ..
echo "   Upstream:"
cd .data-worktree && git rev-parse --abbrev-ref --symbolic-full-name @{u} && cd ..
echo "   Sparse checkout:"
cd .data-worktree && git sparse-checkout list && cd ..
echo "   Directory contents:"
ls -la .data-worktree/data-directory/

echo ""
echo "📄 sampledata.json contents:"
cat .data-worktree/data-directory/sampledata.json

echo ""
echo "🎯 Bare repository branches:"
git -C /tmp/shell-explore-1 branch -a

echo ""
echo "======================================================================"
echo "🔬 COMPREHENSIVE VERIFICATION TESTS"
echo "======================================================================"

echo ""
echo "TEST 1: Verify main branch has upstream tracking"
cd /tmp/clone1
MAIN_UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name main@{u} 2>&1)
if [ "$MAIN_UPSTREAM" = "origin/main" ]; then
  echo "   ✅ PASS: main branch tracks origin/main"
else
  echo "   ❌ FAIL: main branch upstream is '$MAIN_UPSTREAM'"
  exit 1
fi

echo ""
echo "TEST 2: Verify data-branch has upstream tracking"
cd /tmp/clone1
DATA_UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name data-branch@{u} 2>&1)
if [ "$DATA_UPSTREAM" = "origin/data-branch" ]; then
  echo "   ✅ PASS: data-branch tracks origin/data-branch"
else
  echo "   ❌ FAIL: data-branch upstream is '$DATA_UPSTREAM'"
  exit 1
fi

echo ""
echo "TEST 3: Verify worktree branch has upstream tracking"
cd /tmp/clone1/.data-worktree
WORKTREE_UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>&1)
if [ "$WORKTREE_UPSTREAM" = "origin/data-branch" ]; then
  echo "   ✅ PASS: worktree tracks origin/data-branch"
else
  echo "   ❌ FAIL: worktree upstream is '$WORKTREE_UPSTREAM'"
  exit 1
fi

echo ""
echo "TEST 4: Verify sparse checkout is configured"
cd /tmp/clone1/.data-worktree
SPARSE_LIST=$(git sparse-checkout list)
if [ "$SPARSE_LIST" = "data-directory" ]; then
  echo "   ✅ PASS: sparse checkout configured for data-directory"
else
  echo "   ❌ FAIL: sparse checkout list is '$SPARSE_LIST'"
  exit 1
fi

echo ""
echo "TEST 5: Verify data-directory exists in worktree"
if [ -d /tmp/clone1/.data-worktree/data-directory ]; then
  echo "   ✅ PASS: data-directory exists in worktree"
else
  echo "   ❌ FAIL: data-directory does not exist"
  exit 1
fi

echo ""
echo "TEST 6: Verify sampledata.json exists and contains {}"
if [ -f /tmp/clone1/.data-worktree/data-directory/sampledata.json ]; then
  CONTENT=$(cat /tmp/clone1/.data-worktree/data-directory/sampledata.json)
  if [ "$CONTENT" = "{}" ]; then
    echo "   ✅ PASS: sampledata.json exists with correct content"
  else
    echo "   ❌ FAIL: sampledata.json content is '$CONTENT'"
    exit 1
  fi
else
  echo "   ❌ FAIL: sampledata.json does not exist"
  exit 1
fi

echo ""
echo "TEST 7: Verify 'x' file DOES exist in worktree (root files always appear)"
echo "   NOTE: Sparse checkout filters DIRECTORIES, not root-level files"
echo "   The 'x' file exists in data-branch root, so it will appear in worktree"
if [ -f /tmp/clone1/.data-worktree/x ]; then
  echo "   ✅ PASS: file 'x' correctly appears (root-level files not filtered)"
else
  echo "   ❌ FAIL: file 'x' should exist (it's in the branch root)"
  exit 1
fi

echo ""
echo "TEST 8: Verify 'other-directory' does NOT exist in worktree (sparse filtering)"
echo "   NOTE: This tests that sparse checkout DOES filter directories"
if [ ! -d /tmp/clone1/.data-worktree/other-directory ]; then
  echo "   ✅ PASS: 'other-directory' correctly filtered by sparse checkout"
else
  echo "   ❌ FAIL: 'other-directory' should not exist in sparse worktree"
  exit 1
fi

echo ""
echo "TEST 9: Verify 'x' file DOES exist in main working directory"
if [ -f /tmp/clone1/x ]; then
  echo "   ✅ PASS: file 'x' exists in main directory"
else
  echo "   ❌ FAIL: file 'x' missing from main directory"
  exit 1
fi

echo ""
echo "TEST 10: Verify 'other-directory' DOES exist in main working directory"
if [ -d /tmp/clone1/other-directory ]; then
  echo "   ✅ PASS: 'other-directory' exists in main directory"
else
  echo "   ❌ FAIL: 'other-directory' missing from main directory"
  exit 1
fi

echo ""
echo "TEST 11: Verify .gitignore exists and contains .data-worktree/"
if [ -f /tmp/clone1/.gitignore ]; then
  if grep -q "^\.data-worktree/$" /tmp/clone1/.gitignore; then
    echo "   ✅ PASS: .gitignore contains .data-worktree/"
  else
    echo "   ❌ FAIL: .gitignore missing .data-worktree/ entry"
    exit 1
  fi
else
  echo "   ❌ FAIL: .gitignore file does not exist"
  exit 1
fi

echo ""
echo "TEST 12: Verify git status is clean (worktree not shown as untracked)"
cd /tmp/clone1
STATUS_OUTPUT=$(git status --porcelain)
if [ -z "$STATUS_OUTPUT" ]; then
  echo "   ✅ PASS: git status is clean (worktree ignored)"
else
  echo "   ❌ FAIL: git status shows uncommitted changes:"
  echo "$STATUS_OUTPUT" | sed 's/^/      /'
  exit 1
fi

echo ""
echo "TEST 13: Verify both branches exist on origin"
cd /tmp/clone1
ORIGIN_BRANCHES=$(git ls-remote --heads origin | awk '{print $2}' | sed 's|refs/heads/||')
if echo "$ORIGIN_BRANCHES" | grep -q "^main$" && echo "$ORIGIN_BRANCHES" | grep -q "^data-branch$"; then
  echo "   ✅ PASS: both main and data-branch exist on origin"
  echo "   Origin branches:"
  echo "$ORIGIN_BRANCHES" | sed 's/^/      - /'
else
  echo "   ❌ FAIL: expected branches missing on origin"
  echo "   Found: $ORIGIN_BRANCHES"
  exit 1
fi

echo ""
echo "TEST 14: Verify git pull works in worktree (requires upstream tracking)"
cd /tmp/clone1/.data-worktree
PULL_OUTPUT=$(git pull --dry-run 2>&1)
PULL_EXIT=$?
if [ $PULL_EXIT -eq 0 ]; then
  echo "   ✅ PASS: git pull works (upstream tracking functional)"
  if [ -n "$PULL_OUTPUT" ]; then
    echo "   Output: $PULL_OUTPUT"
  else
    echo "   (Already up to date, no output)"
  fi
else
  echo "   ❌ FAIL: git pull failed (upstream tracking may be broken)"
  echo "   Exit code: $PULL_EXIT"
  echo "   Output: $PULL_OUTPUT"
  exit 1
fi

echo ""
echo "TEST 15: Verify git push works in worktree (requires upstream tracking)"
cd /tmp/clone1/.data-worktree
if git push --dry-run 2>&1 | grep -q "Everything up-to-date"; then
  echo "   ✅ PASS: git push works (upstream tracking functional)"
else
  echo "   ❌ FAIL: git push failed (upstream tracking may be broken)"
  git push --dry-run 2>&1 | sed 's/^/      /'
  exit 1
fi

echo ""
echo "======================================================================"
echo "✅ ALL VERIFICATION TESTS PASSED (15/15)"
echo "======================================================================"
echo ""
echo "Summary:"
echo "  ✓ Bare repo created: /tmp/shell-explore-1"
echo "  ✓ Clone created: /tmp/clone1"
echo "  ✓ Main branch (main) with upstream tracking → origin/main"
echo "  ✓ Data branch (data-branch) with upstream tracking → origin/data-branch"
echo "  ✓ Worktree created: .data-worktree on data-branch"
echo "  ✓ Worktree has upstream tracking → origin/data-branch"
echo "  ✓ Sparse checkout configured: data-directory only"
echo "  ✓ Sample data file created: data-directory/sampledata.json = {}"
echo "  ✓ .gitignore configured: .data-worktree/ ignored in main repo"
echo "  ✓ Git status clean: worktree directory properly ignored"
echo "  ✓ Sparse checkout verified: directories filtered (other-directory not in worktree)"
echo "  ✓ Root files appear in worktree (file 'x' present, as expected)"
echo "  ✓ Both branches pushed to origin successfully"
echo "  ✓ Git pull/push operations work correctly"
echo ""
