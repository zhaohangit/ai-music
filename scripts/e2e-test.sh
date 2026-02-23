#!/bin/bash

# E2E Test Script for AI Music Pro Project
# This script tests the complete functionality of the application

set -e

echo "🧪 E2E Tests for AI Music Pro"
echo "=============================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

API_URL="${API_URL:-http://localhost:3000}"
PASS_COUNT=0
FAIL_COUNT=0

# Test function
test_api() {
    local method=$1
    local endpoint=$2
    local data=$3
    local expected_status=$4
    local test_name=$5

    echo -n "Testing: $test_name ... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (Status: $http_code)"
        ((PASS_COUNT++))
    else
        echo -e "${RED}✗ FAIL${NC} (Expected: $expected_status, Got: $http_code)"
        echo "Response: $body"
        ((FAIL_COUNT++))
    fi
}

# Wait for server
wait_for_server() {
    echo -n "Waiting for server to start"
    for i in {1..30}; do
        if curl -s "$API_URL/health/live" > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            return 0
        fi
        echo -n "."
        sleep 1
    done
    echo -e "${RED}Server not responding${NC}"
    return 1
}

# Run tests
main() {
    echo ""
    echo "1. Health Check Tests"
    echo "---------------------"
    test_api "GET" "/health/live" "" "200" "Liveness check"
    test_api "GET" "/health/ready" "" "200" "Readiness check"
    test_api "GET" "/health" "" "200" "Health check"

    echo ""
    echo "2. API Documentation Test"
    echo "-------------------------"
    test_api "GET" "/api" "" "200" "API documentation endpoint"

    echo ""
    echo "3. Lyrics API Tests"
    echo "-------------------"
    test_api "POST" "/api/lyrics/generate" '{"idea":"一首关于春天的歌"}' "200" "Generate lyrics"
    test_api "POST" "/api/lyrics/enhance" '{"prompt":"欢快的夏日歌曲"}' "200" "Enhance prompt"
    test_api "POST" "/api/lyrics/recommend-style" '{"description":"一首悲伤的情歌"}' "200" "Recommend style"
    test_api "POST" "/api/lyrics/generate" '{}' "400" "Generate lyrics - missing params"

    echo ""
    echo "4. Music API Tests"
    echo "------------------"
    test_api "POST" "/api/music/create" '{"mode":"inspiration","prompt":"一首欢快的夏日歌曲"}' "200" "Create music - inspiration mode"
    test_api "POST" "/api/music/create" '{"mode":"invalid"}' "400" "Create music - invalid mode"
    test_api "GET" "/api/music/status/invalid-id" "" "200" "Get music status"

    echo ""
    echo "5. Error Handling Tests"
    echo "-----------------------"
    test_api "GET" "/api/nonexistent" "" "404" "Non-existent endpoint"

    echo ""
    echo "================================"
    echo -e "Results: ${GREEN}Passed: $PASS_COUNT${NC} / ${RED}Failed: $FAIL_COUNT${NC}"
    echo "================================"

    if [ $FAIL_COUNT -gt 0 ]; then
        exit 1
    fi
}

# Check if server is running
if ! curl -s "$API_URL/health/live" > /dev/null 2>&1; then
    echo -e "${YELLOW}Warning: Server not running at $API_URL${NC}"
    echo "Starting server in background..."
    cd "$(dirname "$0")/.."
    npm run dev:backend &
    SERVER_PID=$!
    wait_for_server
fi

main

# Cleanup
if [ ! -z "$SERVER_PID" ]; then
    kill $SERVER_PID 2>/dev/null || true
fi
