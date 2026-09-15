"""aetos_provider — base classes for provider-api v1 sidecars.

A sidecar subclasses SttProvider or TtsProvider, implements one method, and calls serve().
Everything else (health, capabilities, version, unix socket, manifest) is here.
"""
from .base import Provider, SttProvider, TtsProvider, serve, load_manifest
from . import provider_pb2 as pb, provider_pb2_grpc as rpc
__all__ = ["Provider", "SttProvider", "TtsProvider", "serve", "load_manifest", "pb", "rpc"]
