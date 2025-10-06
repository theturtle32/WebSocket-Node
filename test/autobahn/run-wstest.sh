#!/bin/bash

# Get the short commit SHA (fallback to 'unknown' if not in git repo)
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Generate config with current commit SHA
CONFIG_FILE="${PWD}/config/fuzzingclient.json"
TEMP_CONFIG="${PWD}/config/fuzzingclient-temp.json"

# Replace the agent string with commit SHA
sed "s/\"agent\": \"WebSocket-Node [^\"]*\"/\"agent\": \"WebSocket-Node@${COMMIT_SHA}\"/" "$CONFIG_FILE" > "$TEMP_CONFIG"

# Run tests with temporary config
docker run -it --rm \
    -v "${PWD}/config:/config" \
    -v "${PWD}/reports:/reports" \
    -p 9001:9001 \
    --name fuzzingclient \
    crossbario/autobahn-testsuite \
    wstest -m fuzzingclient --spec /config/fuzzingclient-temp.json

# Clean up temporary config
rm -f "$TEMP_CONFIG"