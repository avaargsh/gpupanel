"""Fail-closed Linux Unix-domain socket peer credential primitives.

This module intentionally does not authenticate a browser/Core principal, issue
grants, or authorize session actions. It only reads kernel-provided SO_PEERCRED
for an already-connected AF_UNIX socket and optionally checks an expected UID.
Callers must still bind this OS identity to an independently authenticated
application principal before exposing any session data.
"""
from __future__ import annotations

from dataclasses import dataclass
import socket
import struct


class PeerIdentityUnavailable(Exception):
    """Raised when kernel peer credentials cannot be safely established."""


@dataclass(frozen=True)
class PeerCredentials:
    pid: int
    uid: int
    gid: int


def read_peer_credentials(sock: socket.socket) -> PeerCredentials:
    """Return Linux kernel credentials for a connected AF_UNIX peer.

    No fallback to PID files, environment variables, HTTP headers, loopback
    addresses, bearer tokens, or caller-supplied UID values is permitted.
    """
    if not hasattr(socket, "SO_PEERCRED"):
        raise PeerIdentityUnavailable("SO_PEERCRED is unavailable on this platform")
    # SO_PEERCRED is meaningful only for AF_UNIX sockets. Fail closed before
    # querying the option so callers cannot accidentally pass TCP/other sockets.
    if getattr(sock, "family", None) != socket.AF_UNIX:
        raise PeerIdentityUnavailable("peer credentials require an AF_UNIX socket")
    try:
        raw = sock.getsockopt(
            socket.SOL_SOCKET, socket.SO_PEERCRED, struct.calcsize("3i")
        )
        if not isinstance(raw, (bytes, bytearray)) or len(raw) != struct.calcsize("3i"):
            raise PeerIdentityUnavailable("kernel peer credential payload has invalid size")
        pid, uid, gid = struct.unpack("3i", raw)
    except (OSError, struct.error) as exc:
        raise PeerIdentityUnavailable("kernel peer credentials unavailable") from exc

    # UID 0 is deliberately excluded from this unprivileged observer contract.
    if pid <= 0 or uid <= 0 or gid < 0:
        raise PeerIdentityUnavailable("invalid or privileged peer identity")
    return PeerCredentials(pid=pid, uid=uid, gid=gid)


def require_peer_uid(sock: socket.socket, expected_uid: int) -> PeerCredentials:
    """Require an explicit non-root UID match; never infer expected_uid."""
    if type(expected_uid) is not int or expected_uid <= 0:
        raise PeerIdentityUnavailable("expected UID must be an explicit non-root integer")
    peer = read_peer_credentials(sock)
    if peer.uid != expected_uid:
        raise PeerIdentityUnavailable("Unix socket peer UID mismatch")
    return peer
