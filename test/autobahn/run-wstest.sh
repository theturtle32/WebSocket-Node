#!/bin/bash

# wstest -s ./fuzzingclient.json -m fuzzingclient

docker run -it --rm \
    -v "${PWD}/config:/config" \
    -v "${PWD}/reports:/reports" \
    -p 9001:9001 \
    --name fuzzingclient \
    crossbario/autobahn-testsuite \
    wstest -m fuzzingclient --spec /config/fuzzingclient.json