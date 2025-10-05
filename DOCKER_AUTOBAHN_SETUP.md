# Docker Container Setup: Autobahn Test Suite

## Overview

This document provides instructions for modifying the Dockerfile to include the Autobahn WebSocket Protocol Test Suite, enabling RFC 6455 compliance testing without requiring Docker-in-Docker.

## Required Dockerfile Modifications

### 1. Install Python pip and virtualenv

Add the following to your Dockerfile to install pip3 and venv support:

```dockerfile
RUN apt-get update && \
    apt-get install -y python3-pip python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

### 2. Install Autobahn Test Suite

Create a Python virtual environment and install the Autobahn Test Suite:

```dockerfile
RUN python3 -m venv /home/ubuntu/wstest-env && \
    /home/ubuntu/wstest-env/bin/pip install --no-cache-dir autobahntestsuite
```

### 3. Set Ownership (if needed)

If your container runs as a non-root user (e.g., `ubuntu`), ensure proper ownership:

```dockerfile
RUN chown -R ubuntu:ubuntu /home/ubuntu/wstest-env
```

## Complete Dockerfile Section

Here's a complete section you can add to your Dockerfile:

```dockerfile
# Install Autobahn WebSocket Test Suite
RUN apt-get update && \
    apt-get install -y python3-pip python3-venv && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /home/ubuntu/wstest-env && \
    /home/ubuntu/wstest-env/bin/pip install --no-cache-dir autobahntestsuite && \
    chown -R ubuntu:ubuntu /home/ubuntu/wstest-env
```

## Verification

After building the container, verify the installation:

```bash
# Check Python is available
python3 --version

# Check pip is available
/home/ubuntu/wstest-env/bin/pip --version

# Check wstest is installed
/home/ubuntu/wstest-env/bin/wstest --version

# Expected output: Shows Autobahn Test Suite version (e.g., 0.8.x)
```

## Environment Details

- **Python Version Required:** Python 3.x (Python 3.12.3 confirmed working)
- **Installation Method:** pip via Python virtualenv
- **Install Location:** `/home/ubuntu/wstest-env/`
- **Binary Location:** `/home/ubuntu/wstest-env/bin/wstest`
- **Package Name:** `autobahntestsuite` (PyPI)

## Size Considerations

- Python 3 + pip: ~50-100 MB
- Autobahn Test Suite + dependencies: ~30-50 MB
- Total additional space: ~100-150 MB

## Notes

- The virtual environment approach isolates dependencies and prevents conflicts
- `--no-cache-dir` flag reduces image size by not caching pip downloads
- Cleaning apt cache (`rm -rf /var/lib/apt/lists/*`) further reduces image size
- The test suite will be available at `/home/ubuntu/wstest-env/bin/wstest`
- No Docker-in-Docker required - tests run natively in the container

## Testing After Installation

Once the container is built and running, the WebSocket-Node test suite will automatically detect and use the installed `wstest` binary to run Autobahn protocol compliance tests.
