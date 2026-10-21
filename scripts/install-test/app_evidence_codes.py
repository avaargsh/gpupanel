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

# The deleted payload identity and resource fields. response.AppInstallInfo
# (agent/app/dto/response/app.go) carries no omitempty, so a real answer
# always contains every field: a missing field is a malformed answer, never
# a proof of removal.
APP_INSTALL_REMOVED_ID = 0
APP_INSTALL_REMOVED_RESOURCE_FIELDS = ("container", "composePath")


def classify_app_install_removal(response: object) -> str:
    """Return 'removed' or a constant failure category, never private values.

    'response' is the fixed shape {'http': int, 'code': int, 'data': dict}
    returned by the live script's request helper. Removal is observed only
    on the Agent's complete deleted payload: HTTP 200, business code 200,
    status "Deleted", an exact integer id 0 and exact empty container and
    composePath strings. Every ambiguous, unhealthy, incomplete or wrongly
    typed answer fails closed; an HTTP status alone never proves removal.
    """
    if not isinstance(response, dict):
        return "malformed"
    http = response.get("http")
    code = response.get("code")
    if type(http) is not int or type(code) is not int:
        return "malformed"
    if http >= 500:
        return "unavailable"
    # Any other non-200 answer (404 included) is a refusal, not an
    # observation of removal: the Agent answers an absent AppInstall with
    # HTTP 200 and the deleted payload, so a non-200 answer carries a
    # business error that must not be read as a deleted resource.
    if http != 200 or code != 200:
        return "refused"
    data = response.get("data")
    if not isinstance(data, dict):
        return "malformed"
    status = data.get("status")
    if not isinstance(status, str):
        return "malformed"
    if status != APP_INSTALL_REMOVED_STATUS:
        return "still-installed"
    if "id" not in data:
        return "malformed"
    install_id = data["id"]
    # Exact int: a bool or float identity is not an absent identity.
    if type(install_id) is not int:
        return "malformed"
    if install_id != APP_INSTALL_REMOVED_ID:
        return "identity-present"
    for field in APP_INSTALL_REMOVED_RESOURCE_FIELDS:
        if field not in data:
            return "malformed"
        resource = data[field]
        if not isinstance(resource, str):
            return "malformed"
        if resource:
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
