"""Fixed-vocabulary, privacy-preserving G5 live resource evidence diagnostics.

This module never formats actual Task IDs, container names, API error values,
URLs or responses into CI output. Classification is only for debugging a
failed acceptance: it never authorizes retries or weakens release gates.
"""
from __future__ import annotations


# The Agent answers a removed AppInstall with HTTP 200 and status "Deleted"
# (agent/app/service/app_install.go, AppInstallService.GetAppInstallInfo).
# The removal signal is therefore the payload contract, never an HTTP
# refusal and never a request URL, response body or user content.
APP_INSTALL_REMOVED_STATUS = "Deleted"


def classify_app_install_removal(response: object) -> str:
    """Return 'removed' or a constant failure category, never private values.

    'response' is the fixed shape {'http': int, 'code': int, 'data': dict}
    returned by the live script's request helper. Every ambiguous or
    unhealthy answer fails closed: only an explicit "not found" or the
    Agent's documented deleted-resource payload proves removal.
    """
    if not isinstance(response, dict):
        return "malformed"
    http = response.get("http")
    code = response.get("code")
    if type(http) is not int or type(code) is not int:
        return "malformed"
    if http >= 500:
        return "unavailable"
    if http == 404:
        return "removed"
    if http != 200 or code != 200:
        return "refused"
    data = response.get("data")
    if not isinstance(data, dict):
        return "malformed"
    if data.get("status") != APP_INSTALL_REMOVED_STATUS:
        return "still-installed"
    if data.get("id") not in (0, None):
        return "identity-present"
    if data.get("container") or data.get("composePath"):
        return "resource-present"
    return "removed"


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
        # Never expose actual resource identifiers or API payloads in public CI.
        # A fixed subcategory narrows investigation without authorizing success.
        containers = value.get("containers")
        if not isinstance(containers, list):
            return "classification-container-malformed"
        if not containers:
            return "classification-container-empty"
        if len(containers) != 1:
            return "classification-container-count"
        if not isinstance(containers[0], dict):
            return "classification-container-malformed"
        if containers[0].get("state") != "running":
            return "classification-container-state"
        return "classification-other"
    if value.get("verified") is not False:
        return "verification-flag"
    containers = value.get("containers")
    if not isinstance(containers, list) or len(containers) != 1 or not isinstance(containers[0], dict):
        return "container-count"
    if containers[0].get("state") != "running":
        return "container-state"
    return "ok"
