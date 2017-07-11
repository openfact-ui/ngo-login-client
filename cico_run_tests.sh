#!/bin/bash

# Show command before executing
set -x

# Exit on error
set -e

# We need to disable selinux for now, XXX
/usr/sbin/setenforce 0

# Get all the deps in
yum -y install \
  docker \
  make \
  git
service docker start

# Build builder image
docker build -t openfact-ui-builder -f Dockerfile.builder .
mkdir -p dist && docker run --detach=true --name=openfact-ui-builder -e "API_URL=http://demo.api.almighty.io/api/" -t -v $(pwd)/dist:/dist:Z openfact-ui-builder

# Build almighty-ui
docker exec openfact-ui-builder npm install

## Exec unit tests
docker exec openfact-ui-builder ./run_unit_tests.sh

if [ $? -eq 0 ]; then
  echo 'CICO: unit tests OK'
else
  echo 'CICO: unit tests FAIL'
  exit 1
fi

## Exec functional tests
docker exec openfact-ui-builder ./run_functional_tests.sh
