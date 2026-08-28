"""Aetos One — keep Home Assistant Core/OS/Supervisor updates locked down.

Updating Core replaces the branded frontend with the stock upstream one. Per
operator policy these system updates must never be offered or applied. This
system integration, on every startup (and periodically):

  1. Registry-disables the Core, OS and Supervisor update entities, so they
     never appear in the UI.
  2. Turns the Supervisor's own auto-update OFF via the Supervisor API, so the
     Supervisor never silently updates itself (the one component that DOES
     auto-update by default).
  3. Dismisses any Core/OS/Supervisor "update available" persistent
     notifications, so no update prompt is shown.

Add-on / HACS updates are left untouched.
"""
from __future__ import annotations

import logging
import os
from datetime import timedelta

from homeassistant.components import persistent_notification as pn
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant, callback
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "aetos_no_update"
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

_SUPERVISOR = "http://supervisor"
# Frequent, self-healing re-assertion so a newly-offered version is suppressed
# within minutes and never surfaces to the operator.
_SCAN = timedelta(minutes=5)

# The Home Assistant system update entities to keep permanently disabled.
# Aetos One: lock ONLY Core (Core updates replace the branded frontend).
# Supervisor + OS MUST stay updatable, or the Supervisor considers itself
# outdated and blocks the add-on store.
_TARGET_ENTITY_IDS = (
    "update.home_assistant_core_update",
)

# Keywords identifying a *system* update-available notification (post-rebrand
# the text reads "Aetos One ..."; we also match the raw upstream strings).
_UPDATE_HINT = ("update",)
_SYSTEM_HINT = (
    "aetos one core", "aetos one os", "aetos one supervisor",
    "home assistant core", "home assistant operating system",
    "home assistant supervisor", "home assistant", "aetos one",
)


def _disable_entities(hass: HomeAssistant) -> None:
    """Registry-disable the system update entities if present and enabled."""
    try:
        registry = er.async_get(hass)
    except Exception:  # pragma: no cover - defensive, never break HA
        return
    for entity_id in _TARGET_ENTITY_IDS:
        entry = registry.async_get(entity_id)
        if entry is not None and entry.disabled_by is None:
            try:
                registry.async_update_entity(
                    entity_id, disabled_by=er.RegistryEntryDisabler.USER
                )
                _LOGGER.info("Aetos One: disabled system update entity %s", entity_id)
            except Exception:  # pragma: no cover
                _LOGGER.debug("Could not disable %s", entity_id, exc_info=True)


@callback
def _dismiss_update_notifications(hass: HomeAssistant) -> None:
    """Dismiss Core/OS/Supervisor update-available persistent notifications."""
    try:
        from homeassistant.components import persistent_notification as pn
    except Exception:  # pragma: no cover
        return
    for state in hass.states.async_all("persistent_notification"):
        try:
            nid = state.entity_id.split(".", 1)[1]
            text = (
                str(state.attributes.get("title", ""))
                + " "
                + str(state.attributes.get("message", ""))
                + " "
                + nid
            ).lower()
            # NEVER touch HACS (or add-on) notifications - operators WANT HACS
            # update prompts to show so custom cards/integrations stay current.
            if "hacs" in text or "add-on" in text or "addon" in text:
                continue
            if not any(h in text for h in _UPDATE_HINT):
                continue
            if "available" not in text and "new version" not in text:
                continue
            if not any(h in text for h in _SYSTEM_HINT):
                continue
            pn.async_dismiss(hass, nid)
            _LOGGER.info("Aetos One: dismissed update notification %s", nid)
        except Exception:  # pragma: no cover
            _LOGGER.debug("notif dismiss skip", exc_info=True)


@callback
def _ignore_update_repairs(hass: HomeAssistant) -> None:
    """Ignore any Core/OS/Supervisor update-related Repairs issue."""
    try:
        registry = ir.async_get(hass)
    except Exception:  # pragma: no cover
        return
    for (domain, issue_id), issue in list(getattr(registry, "issues", {}).items()):
        try:
            tk = str(getattr(issue, "translation_key", "") or "")
            blob = f"{domain} {issue_id} {tk}".lower()
            # NEVER touch HACS repairs - operators want HACS updates to surface.
            if "hacs" in blob:
                continue
            if domain not in ("homeassistant", "hassio", "supervisor", "update"):
                continue
            if "update" not in blob and "version" not in blob:
                continue
            if getattr(issue, "dismissed_version", None):
                continue
            ir.async_ignore_issue(hass, domain, issue_id, True)
            _LOGGER.info("Aetos One: ignored update repair %s/%s", domain, issue_id)
        except Exception:  # pragma: no cover
            _LOGGER.debug("repair ignore skip", exc_info=True)


async def _supervisor_disable_auto_update(hass: HomeAssistant) -> None:
    """Ensure the Supervisor's own auto-update stays ON (stay current)."""
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        _LOGGER.debug("No SUPERVISOR_TOKEN; skipping supervisor auto-update off")
        return
    try:
        session = async_get_clientsession(hass)
        resp = await session.post(
            f"{_SUPERVISOR}/supervisor/options",
            headers={"Authorization": f"Bearer {token}"},
            json={"auto_update": True},
        )
        if resp.status == 200:
            _LOGGER.info("Aetos One: Supervisor auto-update ENABLED (stay current for add-on store)")
        else:
            _LOGGER.debug("Supervisor options returned HTTP %s", resp.status)
    except Exception:  # pragma: no cover - never break HA
        _LOGGER.debug("Could not set supervisor auto_update", exc_info=True)


async def _supervisor_set_hostname(hass: HomeAssistant) -> None:
    """Seed the default hostname ONCE on first boot, then respect any hostname
    the user later sets in the UI. A flag file (/config/.aetos_hostname_seeded)
    records that the one-time seed ran, so a user rename is never overridden.
    An optional /config/aetos_hostname.txt provides a per-unit default."""
    flag = hass.config.path(".aetos_hostname_seeded")
    if os.path.exists(flag):
        return  # already seeded once - never override the user's chosen hostname
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        return
    desired = "aetosone"
    def _read_name(nf):
        try:
            if os.path.exists(nf):
                with open(nf) as fh:
                    v = fh.read().strip()
                    if v:
                        return v
        except Exception:  # pragma: no cover
            pass
        return None
    _nf = hass.config.path("aetos_hostname.txt")
    _v = await hass.async_add_executor_job(_read_name, _nf)
    if _v:
        desired = _v
    headers = {"Authorization": f"Bearer {token}"}
    try:
        session = async_get_clientsession(hass)
        resp = await session.get(f"{_SUPERVISOR}/host/info", headers=headers)
        if resp.status != 200:
            return  # supervisor not ready - try again next pass (don't seed yet)
        current = ((await resp.json()).get("data") or {}).get("hostname")
        if current and current != desired:
            r = await session.post(
                f"{_SUPERVISOR}/host/options",
                headers=headers,
                json={"hostname": desired},
            )
            if r.status == 200:
                _LOGGER.info("Aetos One: seeded hostname '%s' (was %s)", desired, current)
        # mark as seeded so future user renames stick (off the event loop)
        def _write_flag(p):
            try:
                with open(p, "w") as fh:
                    fh.write("1")
            except Exception:  # pragma: no cover
                pass
        await hass.async_add_executor_job(_write_flag, flag)
    except Exception:  # pragma: no cover - never break HA
        _LOGGER.debug("Could not seed hostname", exc_info=True)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Apply the update lock at setup, at start, and periodically."""

    state = {"busy": False}

    def _sync_pass() -> None:
        _disable_entities(hass)
        _dismiss_update_notifications(hass)
        _ignore_update_repairs(hass)

    async def _full_pass(*_) -> None:
        _sync_pass()
        await _supervisor_disable_auto_update(hass)
        await _supervisor_set_hostname(hass)

    @callback
    def _on_notifications(*_) -> None:
        # Instant, event-driven dismissal: the moment a Core/OS/Supervisor
        # update prompt is created, close it. Re-entrancy guarded because
        # dismissing re-fires this same signal.
        if state["busy"]:
            return
        state["busy"] = True
        try:
            _dismiss_update_notifications(hass)
        finally:
            state["busy"] = False

    # Immediate (synchronous) pass so entities are hidden as early as possible.
    _sync_pass()
    # Full pass (incl. Supervisor API) once HA has fully started.
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _full_pass)
    # Periodic self-healing re-assertion (must run ON the loop, not a worker
    # thread, because _disable_entities calls async_update_entity).
    @callback
    def _interval_pass(now) -> None:
        _sync_pass()
    async_track_time_interval(hass, _interval_pass, _SCAN)
    # Instant dismissal whenever notifications change.
    async_dispatcher_connect(
        hass, pn.SIGNAL_PERSISTENT_NOTIFICATIONS_UPDATED, _on_notifications
    )

    _LOGGER.info(
        "Aetos One update lock active "
        "(entities disabled, supervisor auto-update off, update notices dismissed)"
    )
    return True
