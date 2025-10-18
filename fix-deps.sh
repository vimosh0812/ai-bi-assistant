#!/bin/bash

echo "🔧 Fixing dependency lockfile issues..."

# Remove existing lockfiles and node_modules
echo "📦 Cleaning existing dependencies..."
rm -rf node_modules
rm -f pnpm-lock.yaml
rm -f package-lock.json

# Install dependencies with pnpm
echo "📥 Installing dependencies with pnpm..."
pnpm install

echo "✅ Dependencies fixed! You can now run 'npm run build'"
