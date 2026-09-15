#!/usr/bin/env bash
# Regenerate provider-api v1 stubs into every Python consumer. Run after editing the .proto.
set -euo pipefail
cd "$(dirname "$0")/.."
PROTO=contracts/provider-api/v1/provider.proto
for dst in providers/_sdk/aetos_provider agent/aetos_agent aetosd; do
  python3 -m grpc_tools.protoc -I contracts/provider-api/v1 --python_out=$dst --grpc_python_out=$dst --pyi_out=$dst $PROTO
  # make the generated import package-relative
  sed -i 's/^import provider_pb2 as provider__pb2/from . import provider_pb2 as provider__pb2/' $dst/provider_pb2_grpc.py
done
echo "stubs regenerated"
