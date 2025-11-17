#!/bin/bash

# Development deployment script with file watching
# Builds on file changes and auto-deploys to vault

set -e

# Convert Windows path to WSL path
VAULT_PATH="/mnt/d/Vaults/Banister/.obsidian/plugins/canvas-roots"

echo "Starting Canvas Roots development mode..."
echo "Watching for changes and auto-deploying to: $VAULT_PATH"
echo "Press Ctrl+C to stop"
echo ""

# Create plugin directory if it doesn't exist
mkdir -p "$VAULT_PATH"

# Initial build and deploy
echo "Initial build..."
npm run build

echo "Deploying..."
cp main.js "$VAULT_PATH/"
cp manifest.json "$VAULT_PATH/"
cp styles.css "$VAULT_PATH/" 2>/dev/null || true

echo "✓ Initial deployment complete!"
echo "Now watching for changes..."
echo ""

# Watch for changes and rebuild
# We'll use inotifywait if available, otherwise fall back to simple approach
if command -v inotifywait &> /dev/null; then
    while true; do
        # Wait for any .ts file to change
        inotifywait -e modify,create,delete -r --exclude 'node_modules|\.git|main\.js' . 2>/dev/null

        echo "Change detected, rebuilding..."
        if npm run build 2>&1; then
            cp main.js "$VAULT_PATH/"
            cp manifest.json "$VAULT_PATH/"
            cp styles.css "$VAULT_PATH/" 2>/dev/null || true
            echo "✓ Deployed at $(date +%H:%M:%S)"
        else
            echo "✗ Build failed at $(date +%H:%M:%S)"
        fi
        echo ""
    done
else
    echo "Note: Install inotify-tools for automatic rebuilds on file changes"
    echo "Run: sudo apt-get install inotify-tools"
    echo ""
    echo "For now, run 'npm run deploy' manually after making changes."
fi
