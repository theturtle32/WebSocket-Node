# Autobahn Test Suite

I now run this using Docker Desktop for Mac. Unfortunately, the maintainer of the official Autobahn TestSuite Docker image has not published a new version recently, so we have to build the Docker image ourselves.

Clone the autobahn repo, cd to the `docker` directory, and run:
```bash
docker build \
  --build-arg AUTOBAHN_TESTSUITE_VCS_REF=c3655a9 \
  --build-arg BUILD_DATE=2020-08-28 \
  --build-arg AUTOBAHN_TESTSUITE_VERSION=0.8.1 \
  -t crossbario/autobahn-testsuite:latest \
  .
```
