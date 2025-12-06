#!/bin/bash

set -e  # Exit on any error

echo "Starting build process..."

# Check if pnpm is available
if ! command -v pnpm &> /dev/null; then
    echo "pnpm not found, installing..."
    npm install -g pnpm
fi

# Install dependencies
echo "Installing dependencies..."
pnpm install --frozen-lockfile

# Verify components exist
echo "Verifying UI components..."
ls -la components/ui/button.tsx || echo "Button component missing"
ls -la components/ui/input.tsx || echo "Input component missing"
ls -la components/ui/label.tsx || echo "Label component missing"
ls -la components/ui/textarea.tsx || echo "Textarea component missing"
ls -la components/ui/tabs.tsx || echo "Tabs component missing"

# Build the application
echo "Building application..."
pnpm run build

echo "Build completed successfully!"
