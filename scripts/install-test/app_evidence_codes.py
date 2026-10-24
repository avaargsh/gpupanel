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


def classify_duplicate_fence(
    response: object, inventory_before: object, inventory_after: object
) -> str:
    """Return 'denied' only for a clean refusal with unchanged inventory.

    Both duplicate probes are deliberate, not retries of the accepted install.
    A 5xx answer is 'unavailable' rather than proof that the fence denied the
    request; a malformed answer is 'malformed'; an accepted response is
    'accepted'; any durable TaskDB/AppInstall/Docker inventory change is
    'inventory-changed'. Never format response values or inventory identities.
    """
    if not isinstance(response, dict):
        return "malformed"
    http = response.get("http")
    code = response.get("code")
    if type(http) is not int or type(code) is not int:
        return "malformed"
    if http >= 500 or code >= 500:
        return "unavailable"
    if http == 200 and code == 200:
        return "accepted"
    if inventory_before != inventory_after:
        return "inventory-changed"
    return "denied"


def classify_restart_fence(response: object, install_id: int, task_id: str) -> str:
    """Return 'ok' only when restarted Agent evidence is still consistent.

    The caller has already verified the same evidence before the restart.
    A 5xx or non-200 business answer is 'unavailable' (the Agent may still be
    starting); a malformed answer is 'malformed'; any accepted answer whose
    install identity, task status, app status, classification or container
    state differs from the pre-restart consistent state is 'evidence-changed'.
    """
    if not isinstance(response, dict):
        return "malformed"
    http = response.get("http")
    if type(http) is not int:
        return "malformed"
    code = response.get("code")
    if type(code) is not int:
        # A gateway/startup error page carries no business code; it is a
        # transient unavailability, not malformed app evidence.
        return "unavailable" if http >= 500 else "malformed"
    if http >= 500 or code >= 500:
        return "unavailable"
    if http != 200 or code != 200:
        return "unavailable"
    result = classify_app_install_evidence(
        response.get("data"), install_id, task_id
    )
    if result == "ok":
        return "ok"
    if result == "malformed":
        return "malformed"
    return "evidence-changed"


# Pending AppInstall states that mean reconciliation has not happened yet
# (agent/app/service/app_operation_status.go).
APP_INSTALL_PENDING_STATUSES = (
    "Installing", "Rebuilding", "Upgrading", "Uninstalling", "Starting",
    "Restarting", "Waiting",
)


def classify_unknown_fence(
    response: object, install_id: int, task_id: str
) -> str:
    """Return 'unknown' only for a durable UNKNOWN interrupted-install record.

    The caller observed the same install Executing before the injection, so
    'unknown' requires the restarted Agent to keep the same AppInstall and
    TaskDB identity while both records are Unknown, the evidence
    classification is UNKNOWN with INSTALL_OUTCOME_NOT_RECONCILED and the
    snapshot is not verified. A still-pending record is 'not-unknown'; any
    other accepted mismatch (including a Success/Failed task) is
    'evidence-changed'. A 5xx, non-200 or business-error answer is
    'unavailable' because the Agent may still be starting; wrongly typed
    answers are 'malformed'. Never formats payload values.
    """
    if not isinstance(response, dict):
        return "malformed"
    http = response.get("http")
    if type(http) is not int:
        return "malformed"
    code = response.get("code")
    if type(code) is not int:
        # A gateway/startup error page carries no business code; it is a
        # transient unavailability, not malformed app evidence.
        return "unavailable" if http >= 500 else "malformed"
    if http >= 500 or code >= 500:
        return "unavailable"
    if http != 200 or code != 200:
        return "unavailable"
    data = response.get("data")
    if not isinstance(data, dict):
        return "malformed"
    if type(data.get("installId")) is not int:
        return "evidence-changed"
    if data["installId"] != install_id:
        return "evidence-changed"
    if data.get("taskId") != task_id:
        return "evidence-changed"
    task_status = data.get("taskStatus")
    app_status = data.get("appStatus")
    if task_status != "Unknown" or app_status != "Unknown":
        if task_status == "Executing" or app_status in APP_INSTALL_PENDING_STATUSES:
            return "not-unknown"
        return "evidence-changed"
    if data.get("classification") != "UNKNOWN":
        return "evidence-changed"
    reasons = data.get("reasons")
    if (not isinstance(reasons, list)
            or "INSTALL_OUTCOME_NOT_RECONCILED" not in reasons):
        return "evidence-changed"
    if data.get("verified") is not False:
        return "evidence-changed"
    return "unknown"


def classify_inflight_receipt(value: object, task_id: str) -> str:
    """Return 'executing' only for one exactly matching running install task.

    'value' is the TaskDB search payload. A missing receipt is 'absent'; a
    receipt with another operation or empty status is 'malformed'; any
    terminal status is 'terminal'. This only observes a supposedly running
    task before a deliberate crash; it never authorizes a retry.
    """
    if not isinstance(value, dict):
        return "malformed"
    items = value.get("items")
    if not isinstance(items, list):
        return "malformed"
    matches = [
        item for item in items
        if isinstance(item, dict) and item.get("id") == task_id
    ]
    if len(matches) > 1:
        return "malformed"
    if not matches:
        return "absent"
    item = matches[0]
    if item.get("type") != "App" or item.get("operate") != "TaskInstall":
        return "malformed"
    status = item.get("status")
    if status == "Executing":
        if type(item.get("resourceID")) is not int or item["resourceID"] <= 0:
            return "malformed"
        return "executing"
    if isinstance(status, str) and status:
        return "terminal"
    return "malformed"


# Keep this detail aligned with requireReconciledAppInstallation in Go. The
# API wraps errors in a localized message, but preserves this exact detail as
# the suffix; generic 5xx business errors must never count as gate refusals.
UNKNOWN_MUTATION_REFUSAL_DETAIL = "application installation outcome is unknown; inspect task, app record and Docker resources before modifying it"


def classify_gate_refusal(
    response: object,
    inventory_before: object,
    inventory_after: object,
    still_unknown: object,
) -> str:
    """Accept only the known UNKNOWN mutation-gate rejection, never any error.

    The API envelope uses HTTP 200 for application errors and places its
    business status in 'code'. A stable suffix from the current Go gate error
    distinguishes the intended rejection from unrelated Agent failures.
    Raw messages are inspected in memory only and never enter CI diagnostics.
    """
    if not isinstance(response, dict):
        return "malformed"
    http = response.get("http")
    code = response.get("code")
    if type(http) is not int or type(code) is not int:
        return "malformed"
    if http >= 500:
        return "unavailable"
    if http != 200:
        return "unexpected-error"
    if code == 200:
        return "accepted"
    if code < 400:
        return "unexpected-error"
    message = response.get("message")
    if not isinstance(message, str) or not message or len(message) > 1024:
        return "malformed"
    if not message.endswith(UNKNOWN_MUTATION_REFUSAL_DETAIL):
        return "unavailable" if code >= 500 else "unexpected-error"
    if inventory_before != inventory_after:
        return "inventory-changed"
    if still_unknown is not True:
        return "evidence-changed"
    return "refused"
