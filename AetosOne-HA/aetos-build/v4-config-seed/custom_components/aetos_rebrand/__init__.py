"""Aetos One — rewrite backend 'Home Assistant' strings in persistent notifications.

The frontend is fully rebranded, but the Supervisor and Core containers are
upstream/unmodified and still emit 'Home Assistant' text in persistent
notifications (update available, unsupported system, backups, etc.).

This system integration watches the persistent-notification store and rewrites
'Home Assistant' -> 'Aetos One' in place whenever notifications change, so the
notification centre stays on-brand. It only rewrites text; it never dismisses.
"""
from __future__ import annotations

import logging

from homeassistant.components import persistent_notification as pn
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant, callback
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)
from homeassistant.helpers.typing import ConfigType

_LOGGER = logging.getLogger(__name__)

DOMAIN = "aetos_rebrand"
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)

# Preserve the third-party "Home Assistant Community Store" (HACS) name.
_HACS = "Home Assistant Community Store"
_HACS_TOKEN = "\x00HACS\x00"

# Longest / most-specific phrases first so nested matches resolve correctly.
_ORDERED = (
    ("Home Assistant Operating System", "Aetos One OS"),
    ("Home Assistant Core", "Aetos One Core"),
    ("Home Assistant Supervisor", "Aetos One Supervisor"),
    ("Home Assistant", "Aetos One"),
)


def _rewrite(text):
    """Return text with 'Home Assistant' variants rebranded to 'Aetos One'."""
    if not text or not isinstance(text, str) or "Home Assistant" not in text:
        return text
    out = text.replace(_HACS, _HACS_TOKEN)
    for src, dst in _ORDERED:
        out = out.replace(src, dst)
    return out.replace(_HACS_TOKEN, _HACS)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the notification rebrand sweeper."""
    state = {"running": False}

    @callback
    def _sweep(*_) -> None:
        # Guard against re-entrancy: our re-dispatch below re-fires this signal.
        if state["running"]:
            return
        try:
            notifications = pn._async_get_or_create_notifications(hass)  # noqa: SLF001
        except Exception:  # pragma: no cover - defensive, never break HA
            return
        changed = False
        for notif in list(notifications.values()):
            for key in ("title", "message"):
                old = notif.get(key)
                new = _rewrite(old)
                if new != old:
                    notif[key] = new
                    changed = True
        if not changed:
            return
        state["running"] = True
        try:
            async_dispatcher_send(hass, pn.SIGNAL_PERSISTENT_NOTIFICATIONS_UPDATED)
        finally:
            state["running"] = False

    async_dispatcher_connect(
        hass, pn.SIGNAL_PERSISTENT_NOTIFICATIONS_UPDATED, _sweep
    )
    hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _sweep)
    _sweep()
    _LOGGER.info("Aetos One rebrand: persistent-notification sweeper active")
    return True
