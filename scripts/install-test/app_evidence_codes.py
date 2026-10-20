"""Fixed-vocabulary, privacy-preserving G5 live resource evidence diagnostics.

This module never formats actual Task IDs, container names, API error values,
URLs or responses into CI output. Classification is only for debugging a
failed acceptance: it never authorizes retries or weakens release gates.
"""
from __future__ import annotations


def classify_app_install_evidence(value: object, install_id: int, task_id: str) -> str:
    """Return 'ok' or a constant failure category, never private values."""
    if not isinstance(value, dict):
        return "malformed"
    if type(value.get("installId")) is not int or value["installId"] != install_id:
        return "install-id"
    if value.get("taskId") != task_id:
        return "task-id"
    if value.get("taskStatus") != "Success":
        return "task-status"
    if value.get("appStatus") != "Running":
        return "app-status"
    if value.get("classification") != "CONSISTENT":
        return "classification"
    if value.get("verified") is not False:
        return "verification-flag"
    containers = value.get("containers")
    if not isinstance(containers, list) or len(containers) != 1 or not isinstance(containers[0], dict):
        return "container-count"
    if containers[0].get("state") != "running":
        return "container-state"
    return "ok"
