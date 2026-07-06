#!/bin/bash
# Deploy Supabase Edge Functions (Linux)
# Usage: ./deploy-functions.sh [function-name]
# Run from the Vulnerix/ directory

set -e

SOURCE="supabase/functions"
TARGET="../Supabase/docker/volumes/functions"
CONTAINER="supabase-edge-functions"

ALL_FUNCTIONS=("cve-engine" "delete-user" "send-email" "splunk-advisories")

# If a specific function is passed as argument
if [ -n "$1" ]; then
    FOUND=false
    for fn in "${ALL_FUNCTIONS[@]}"; do
        if [ "$fn" == "$1" ]; then
            FOUND=true
            break
        fi
    done

    if [ "$FOUND" == "false" ]; then
        echo "[ERROR] Unknown function '$1'. Available: ${ALL_FUNCTIONS[*]}"
        exit 1
    fi

    TO_DEPLOY=("$1")
else
    TO_DEPLOY=("${ALL_FUNCTIONS[@]}")
fi

echo "Deploying ${#TO_DEPLOY[@]} function(s)..."

for fn in "${TO_DEPLOY[@]}"; do
    src="$SOURCE/$fn"
    dst="$TARGET/$fn"

    if [ ! -d "$src" ]; then
        echo "  [SKIP] $fn - source not found at $src"
        continue
    fi

    mkdir -p "$dst"
    cp -rf "$src"/* "$dst"/
    echo "  [OK] $fn"
done

echo "Restarting $CONTAINER..."
docker restart "$CONTAINER"

if [ $? -eq 0 ]; then
    echo "Done. Functions are live."
else
    echo "Failed to restart container."
    exit 1
fi
