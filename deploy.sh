#!/bin/bash

# ========================================
# AI Music Pro - Deployment Script
# ========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  AI Music Pro - Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo -e "${YELLOW}Creating .env from .env.production...${NC}"
    cp .env.production .env
    echo -e "${RED}Please edit .env file with your configuration before continuing!${NC}"
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

echo -e "${GREEN}Building and starting services...${NC}"

# Stop existing containers
docker-compose down --remove-orphans 2>/dev/null || true

# Build and start
docker-compose build --no-cache
docker-compose up -d

echo -e "${GREEN}Waiting for services to be healthy...${NC}"
sleep 10

# Check health
echo -e "${GREEN}Checking service health...${NC}"
docker-compose ps

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Frontend: ${YELLOW}http://localhost:${FRONTEND_PORT:-80}${NC}"
echo -e "Backend API: ${YELLOW}http://localhost:${BACKEND_PORT:-3000}/api${NC}"
echo ""
echo -e "To view logs: ${YELLOW}docker-compose logs -f${NC}"
echo -e "To stop: ${YELLOW}docker-compose down${NC}"
