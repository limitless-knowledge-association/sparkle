#!/bin/bash
# Wrapper script to start daemon for testing
# Usage: ./start-daemon-wrapper.sh <agent_path> <test_id> <log_port>

AGENT_PATH="$1"
TEST_ID="$2"
LOG_PORT="$3"

# Export environment variables
export SPARKLE_LOG_PORT="$LOG_PORT"
export SPARKLE_LOG_TOKEN="$TEST_ID"

# Run the daemon
exec node "$AGENT_PATH" --test-mode --test-id="$TEST_ID" --keep-alive
