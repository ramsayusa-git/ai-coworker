"""Raw BlueZ D-Bus GATT client.

Why this exists instead of bleak
--------------------------------
The RBP1711150377 cuff advertises as dual-mode (BR/EDR + LE) with a
non-zero Class-of-Device. bleak's high-level `BleakClient.connect()`
consistently fails against it on this box with

    org.bluez.Error.BREDR.ProfileUnavailable: No more profiles to connect to

and sometimes with a bare TimeoutError, while a *plain* `Device1.Connect()`
issued over D-Bus — with discovery stopped first — connects and streams
notifications reliably. That was verified with `tools/bp_dbus_probe.py`,
which is where the real measurement frame was captured from.

So this module talks to BlueZ directly via dbus-fast (which ships as a
bleak dependency, so there is nothing new to install):

  Adapter1.StartDiscovery / StopDiscovery      — find the cuff
  Device1.Connect                              — the connect that works
  ObjectManager.GetManagedObjects              — enumerate GATT tree
  GattCharacteristic1.ReadValue / StartNotify   — read DIS, subscribe
  Properties.PropertiesChanged                  — notification delivery

Recovery ladder used between connect attempts (each rung is a known BlueZ
remedy for a stuck dual-mode device): plain Connect → Disconnect then
Connect → Adapter1.RemoveDevice then re-discover then Connect.
"""
from __future__ import annotations

import asyncio
import logging
import time

from dbus_fast import BusType, Message, Variant
from dbus_fast.aio import MessageBus

log = logging.getLogger("bledbus")

BLUEZ = "org.bluez"
ADAPTER_IFACE = "org.bluez.Adapter1"
DEVICE_IFACE = "org.bluez.Device1"
SVC_IFACE = "org.bluez.GattService1"
CHAR_IFACE = "org.bluez.GattCharacteristic1"
PROPS_IFACE = "org.freedesktop.DBus.Properties"
OM_IFACE = "org.freedesktop.DBus.ObjectManager"

PROPS_MATCH = ("type='signal',interface='org.freedesktop.DBus.Properties',"
               "member='PropertiesChanged'")


class BleUnavailable(RuntimeError):
    """No usable Bluetooth adapter / D-Bus on this host."""


class BleError(RuntimeError):
    """A connect/GATT operation failed, but Bluetooth itself is fine."""


class DbusBle:
    """One connection's worth of state. Create, use, close — do not reuse
    across connects (BlueZ object paths go stale)."""

    def __init__(self, address: str, name_prefix: str = ""):
        self.address = (address or "").upper()
        self.name_prefix = (name_prefix or "").lower()
        self.bus: MessageBus | None = None
        self.adapter_path: str | None = None
        self.device_path: str | None = None
        self.device_name: str = ""
        self.chars: dict[str, str] = {}       # uuid -> object path
        self.char_flags: dict[str, list] = {}  # uuid -> flags
        self._notify_cbs: dict[str, callable] = {}   # char path -> cb(bytes)
        self._disconnect_cb = None
        self._handler = None
        self._matched = False
        self.connected = False

    # ------------------------------------------------------------ plumbing
    async def _call(self, path: str, iface: str, member: str,
                    sig: str = "", body=None, timeout: float = 25.0):
        assert self.bus is not None
        msg = Message(destination=BLUEZ, path=path, interface=iface,
                      member=member, signature=sig, body=body or [])
        reply = await asyncio.wait_for(self.bus.call(msg), timeout=timeout)
        if reply is None:
            raise BleError(f"{member}: no reply")
        if reply.message_type.name == "ERROR":
            raise BleError(f"{member}: {reply.error_name}: "
                           f"{reply.body[0] if reply.body else ''}")
        return reply.body

    async def _get_all(self, path: str, iface: str) -> dict:
        body = await self._call(path, PROPS_IFACE, "GetAll", "s", [iface])
        return {k: v.value for k, v in body[0].items()}

    async def _managed(self) -> dict:
        body = await self._call("/", OM_IFACE, "GetManagedObjects", timeout=30.0)
        return body[0]

    async def open(self):
        """Connect to the system bus and locate a powered adapter."""
        try:
            self.bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
        except Exception as e:
            raise BleUnavailable(f"system D-Bus unavailable: {e}") from e
        try:
            objs = await self._managed()
        except Exception as e:
            raise BleUnavailable(f"BlueZ not answering on D-Bus: {e}") from e
        adapters = [p for p, ifaces in objs.items() if ADAPTER_IFACE in ifaces]
        if not adapters:
            raise BleUnavailable("no Bluetooth adapter found on the host")
        # prefer hci0 for stability, else the first one reported
        self.adapter_path = next((p for p in sorted(adapters) if p.endswith("hci0")),
                                 sorted(adapters)[0])
        props = await self._get_all(self.adapter_path, ADAPTER_IFACE)
        if not props.get("Powered"):
            try:
                await self._call(self.adapter_path, PROPS_IFACE, "Set", "ssv",
                                 [ADAPTER_IFACE, "Powered", Variant("b", True)])
                log.info("powered on adapter %s", self.adapter_path)
            except Exception as e:
                raise BleUnavailable(f"adapter {self.adapter_path} is off "
                                     f"and could not be powered on: {e}") from e
        log.info("using adapter %s (%s)", self.adapter_path, props.get("Address", "?"))

    async def close(self):
        if self.bus is None:
            return
        try:
            if self._handler:
                self.bus.remove_message_handler(self._handler)
        except Exception:
            pass
        try:
            self.bus.disconnect()
        except Exception:
            pass
        self.bus = None

    # ------------------------------------------------------------ discovery
    def _dev_path_for(self, address: str) -> str:
        return f"{self.adapter_path}/dev_" + address.upper().replace(":", "_")

    async def _find_device(self, objs: dict) -> str | None:
        """Match by MAC first, then by advertised-name prefix."""
        want = self._dev_path_for(self.address) if self.address else None
        if want and want in objs and DEVICE_IFACE in objs[want]:
            self.device_name = objs[want][DEVICE_IFACE].get(
                "Name", Variant("s", "")).value
            return want
        if self.name_prefix:
            for path, ifaces in sorted(objs.items()):
                d = ifaces.get(DEVICE_IFACE)
                if not d or not path.startswith(str(self.adapter_path)):
                    continue
                name = (d.get("Name", Variant("s", "")).value or
                        d.get("Alias", Variant("s", "")).value or "")
                if name.lower().startswith(self.name_prefix):
                    self.device_name = name
                    return path
        return None

    async def start_discovery(self):
        try:
            await self._call(self.adapter_path, ADAPTER_IFACE, "StartDiscovery")
        except BleError as e:
            if "InProgress" not in str(e):
                log.debug("StartDiscovery: %s", e)

    async def stop_discovery(self):
        try:
            await self._call(self.adapter_path, ADAPTER_IFACE, "StopDiscovery")
        except BleError:
            pass

    async def discover(self, timeout: float, on_tick=None) -> bool:
        """Run active discovery until the device object shows up.

        The cuff only advertises for a few seconds after its button is
        pressed, so discovery stays on for the whole window rather than
        doing one short scan pass. Returns True if found.
        """
        objs = await self._managed()
        self.device_path = await self._find_device(objs)
        if self.device_path:
            return True
        await self.start_discovery()
        try:
            deadline = time.time() + timeout
            while time.time() < deadline:
                await asyncio.sleep(1.0)
                objs = await self._managed()
                self.device_path = await self._find_device(objs)
                if self.device_path:
                    return True
                if on_tick:
                    on_tick(max(0, int(deadline - time.time())))
            return False
        finally:
            # Discovery MUST be off before connecting: an active scan is one
            # of the reasons BlueZ fails the connect on this device.
            await self.stop_discovery()

    # ------------------------------------------------------------ connect
    async def _is_connected(self) -> bool:
        try:
            props = await self._get_all(self.device_path, DEVICE_IFACE)
            return bool(props.get("Connected"))
        except Exception:
            return False

    async def is_connected(self) -> bool:
        """Public liveness check — the Connected signal can be missed."""
        return await self._is_connected()

    async def connect(self, attempts: int = 3, on_attempt=None) -> None:
        """Plain Device1.Connect(), with the recovery ladder between tries."""
        if not self.device_path:
            raise BleError("device not discovered")
        last: Exception | None = None
        for i in range(attempts):
            if on_attempt:
                on_attempt(i + 1, attempts)
            try:
                if await self._is_connected():
                    log.info("already connected")
                else:
                    await self._call(self.device_path, DEVICE_IFACE, "Connect",
                                     timeout=30.0)
                await self._wait_services()
                self.connected = True
                return
            except Exception as e:
                last = e
                log.warning("connect attempt %d/%d failed: %s", i + 1, attempts, e)
                if i == attempts - 1:
                    break
                await self._recover(i)
        raise BleError(str(last) or "connect failed")

    async def _recover(self, attempt: int):
        """Escalating cleanup between connect attempts."""
        try:
            await self._call(self.device_path, DEVICE_IFACE, "Disconnect", timeout=10.0)
        except Exception:
            pass
        await asyncio.sleep(2.0)
        if attempt >= 1:
            # Drop BlueZ's cached record for the device entirely, then let it
            # be rediscovered — clears a stuck BR/EDR profile negotiation.
            try:
                await self._call(self.adapter_path, ADAPTER_IFACE, "RemoveDevice",
                                 "o", [self.device_path], timeout=10.0)
                log.info("removed cached device record, re-discovering")
            except Exception as e:
                log.debug("RemoveDevice: %s", e)
            await self.discover(25.0)

    async def _wait_services(self, timeout: float = 30.0):
        deadline = time.time() + timeout
        while time.time() < deadline:
            props = await self._get_all(self.device_path, DEVICE_IFACE)
            if not props.get("Connected"):
                raise BleError("link dropped during service discovery")
            if props.get("ServicesResolved"):
                return
            await asyncio.sleep(0.5)
        raise BleError("services never resolved")

    async def load_gatt(self) -> dict[str, str]:
        """Map every characteristic UUID under this device to its path."""
        objs = await self._managed()
        self.chars, self.char_flags = {}, {}
        for path, ifaces in sorted(objs.items()):
            if not path.startswith(str(self.device_path)):
                continue
            c = ifaces.get(CHAR_IFACE)
            if c:
                uuid = c["UUID"].value.lower()
                self.chars[uuid] = path
                self.char_flags[uuid] = list(c.get("Flags", Variant("as", [])).value)
        log.info("GATT: %d characteristics", len(self.chars))
        return self.chars

    # ------------------------------------------------------------ GATT I/O
    async def read_char(self, uuid: str) -> bytes | None:
        path = self.chars.get(uuid.lower())
        if not path or "read" not in self.char_flags.get(uuid.lower(), []):
            return None
        try:
            body = await self._call(path, CHAR_IFACE, "ReadValue", "a{sv}", [{}],
                                    timeout=15.0)
            return bytes(body[0])
        except Exception as e:
            log.debug("read %s failed: %s", uuid, e)
            return None

    async def read_string(self, uuid: str) -> str | None:
        raw = await self.read_char(uuid)
        if raw is None:
            return None
        return raw.decode(errors="replace").strip("\x00 ").strip() or None

    def _install_handler(self):
        if self._handler is not None:
            return

        def handler(msg):
            if (msg.member != "PropertiesChanged"
                    or msg.interface != PROPS_IFACE):
                return
            try:
                iface, changed, _ = msg.body
            except Exception:
                return
            if iface == CHAR_IFACE and "Value" in changed:
                cb = self._notify_cbs.get(msg.path)
                if cb:
                    try:
                        cb(bytes(changed["Value"].value))
                    except Exception:
                        log.exception("notify callback")
            elif iface == DEVICE_IFACE and "Connected" in changed:
                if msg.path == self.device_path and not changed["Connected"].value:
                    self.connected = False
                    if self._disconnect_cb:
                        try:
                            self._disconnect_cb()
                        except Exception:
                            pass

        self._handler = handler
        self.bus.add_message_handler(handler)

    async def _ensure_match(self):
        """Ask the bus to actually deliver PropertiesChanged signals to us."""
        if self._matched:
            return
        await self.bus.call(Message(destination="org.freedesktop.DBus",
                                    path="/org/freedesktop/DBus",
                                    interface="org.freedesktop.DBus",
                                    member="AddMatch", signature="s",
                                    body=[PROPS_MATCH]))
        self._matched = True

    async def subscribe(self, uuid: str, cb) -> bool:
        """StartNotify on one characteristic; cb(bytes) per notification."""
        path = self.chars.get(uuid.lower())
        if not path:
            return False
        self._install_handler()
        await self._ensure_match()
        self._notify_cbs[path] = cb
        await self._call(path, CHAR_IFACE, "StartNotify", timeout=15.0)
        log.info("subscribed to %s", uuid)
        return True

    def on_disconnect(self, cb):
        self._disconnect_cb = cb
        self._install_handler()

    async def disconnect(self):
        self.connected = False
        if self.bus is None or not self.device_path:
            return
        for path in list(self._notify_cbs):
            try:
                await self._call(path, CHAR_IFACE, "StopNotify", timeout=8.0)
            except Exception:
                pass
        self._notify_cbs.clear()
        try:
            await self._call(self.device_path, DEVICE_IFACE, "Disconnect", timeout=10.0)
        except Exception:
            pass
