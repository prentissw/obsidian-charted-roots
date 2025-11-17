#!/bin/bash

# Deploy script for Canvas Roots plugin
# Builds the plugin and copies it to the Obsidian vault

set -e

echo "Building Canvas Roots plugin..."
npm run build

# Convert Windows path to WSL path
VAULT_PATH="/mnt/d/Vaults/Banister/.obsidian/plugins/canvas-roots"

echo "Deploying to: $VAULT_PATH"

# Create plugin directory if it doesn't exist
mkdir -p "$VAULT_PATH"

# Copy necessary files
echo "Copying files..."
cp main.js "$VAULT_PATH/"
cp manifest.json "$VAULT_PATH/"
cp styles.css "$VAULT_PATH/" 2>/dev/null || echo "No styles.css found (optional)"

echo "✓ Plugin deployed successfully!"
echo "Reload Obsidian to see changes."
