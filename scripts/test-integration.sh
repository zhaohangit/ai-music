#!/bin/bash

# Integration Test Script
# Tests the full integration between frontend and backend

set -e

echo "🔗 Integration Tests for AI Music Pro"
echo "======================================"

API_URL="${API_URL:-http://localhost:3000}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:5173}"

# Test 1: Backend Health
echo "Testing backend health..."
curl -s "$API_URL/health" | jq -e '.status == "ok"' > /dev/null && echo "✓ Backend is healthy" || echo "✗ Backend health check failed"

# Test 2: Lyrics Generation Flow
echo ""
echo "Testing lyrics generation flow..."
LYRICS_RESPONSE=$(curl -s -X POST "$API_URL/api/lyrics/generate" \
    -H "Content-Type: application/json" \
    -d '{"idea":"一首关于青春的校园歌曲","style":"流行","mood":"温暖"}')

echo "$LYRICS_RESPONSE" | jq -e '.success == true' > /dev/null && echo "✓ Lyrics generated successfully" || echo "✗ Lyrics generation failed"

# Test 3: Style Recommendation
echo ""
echo "Testing style recommendation..."
STYLE_RESPONSE=$(curl -s -X POST "$API_URL/api/lyrics/recommend-style" \
    -H "Content-Type: application/json" \
    -d '{"description":"一首忧伤的情歌，适合深夜聆听"}')

echo "$STYLE_RESPONSE" | jq -e '.success == true' > /dev/null && echo "✓ Style recommendation works" || echo "✗ Style recommendation failed"

# Test 4: Music Creation (Inspiration Mode)
echo ""
echo "Testing music creation (inspiration mode)..."
MUSIC_RESPONSE=$(curl -s -X POST "$API_URL/api/music/create" \
    -H "Content-Type: application/json" \
    -d '{"mode":"inspiration","prompt":"一首欢快的夏日电子舞曲"}')

TASK_ID=$(echo "$MUSIC_RESPONSE" | jq -r '.data.taskId // empty')

if [ ! -z "$TASK_ID" ] && [ "$TASK_ID" != "null" ]; then
    echo "✓ Music creation started with task ID: $TASK_ID"

    # Test 5: Status Check
    echo ""
    echo "Testing music status check..."
    STATUS_RESPONSE=$(curl -s "$API_URL/api/music/status/$TASK_ID")
    echo "$STATUS_RESPONSE" | jq -e '.success == true' > /dev/null && echo "✓ Status check works" || echo "✗ Status check failed"
else
    echo "✗ Music creation failed or returned no task ID"
fi

# Test 6: API Documentation
echo ""
echo "Testing API documentation..."
curl -s "$API_URL/api" | jq -e '.name == "AI Music Pro API"' > /dev/null && echo "✓ API documentation accessible" || echo "✗ API documentation failed"

echo ""
echo "======================================"
echo "Integration tests completed!"
echo "======================================"
