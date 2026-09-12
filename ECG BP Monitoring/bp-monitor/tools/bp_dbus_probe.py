"""Low-level BlueZ D-Bus probe for a dual-mode-flagged BLE device that BlueZ
refuses to Connect() over LE. Uses dbus-fast (ships with bleak).
usage: bp_dbus_probe.py ADDR SECS"""
import asyncio, sys, time
from dbus_fast import BusType, Message, Variant
from dbus_fast.aio import MessageBus

ADDR = sys.argv[1].upper(); SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 120
PATH = "/org/bluez/hci0/dev_" + ADDR.replace(":", "_")
BLUEZ = "org.bluez"
t0 = time.time()
def log(*a): print(f"{time.time()-t0:7.2f}", *a, flush=True)

async def call(bus, path, iface, member, sig="", body=None):
    r = await bus.call(Message(destination=BLUEZ, path=path, interface=iface, member=member,
                               signature=sig, body=body or []))
    if r.message_type.name == "ERROR":
        raise RuntimeError(f"{member}: {r.error_name} {r.body}")
    return r.body

async def props(bus, path, iface):
    b = await call(bus, path, "org.freedesktop.DBus.Properties", "GetAll", "s", [iface])
    return {k: v.value for k, v in b[0].items()}

async def managed(bus):
    b = await call(bus, "/", "org.freedesktop.DBus.ObjectManager", "GetManagedObjects")
    return b[0]

async def main():
    bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
    objs = await managed(bus)
    if PATH not in objs:
        DISC_WAIT = max(SECS, 90)
        log(f"device object not present yet — starting discovery, waiting up to {DISC_WAIT}s (take a measurement now)")
        try:
            await call(bus, "/org/bluez/hci0", "org.bluez.Adapter1", "StartDiscovery")
        except Exception as e:
            log("StartDiscovery failed (maybe already on):", e)
        deadline = time.time() + DISC_WAIT
        while time.time() < deadline:
            objs = await managed(bus)
            if PATH in objs:
                log("device object appeared after", round(time.time() - (deadline - DISC_WAIT), 1), "s")
                break
            await asyncio.sleep(1)
        try:
            await call(bus, "/org/bluez/hci0", "org.bluez.Adapter1", "StopDiscovery")
        except Exception:
            pass
    if PATH in objs:
        p = await props(bus, PATH, "org.bluez.Device1")
        log("device props:", {k: p.get(k) for k in ("Name", "AddressType", "Connected", "ServicesResolved", "UUIDs", "Class", "Paired")})
    else:
        log("device object still not present — giving up")
        return
    # 1) experimental LE-explicit connect
    try:
        await call(bus, "/org/bluez/hci0", "org.bluez.Adapter1", "ConnectDevice", "a{sv}",
                   [{"Address": Variant("s", ADDR), "AddressType": Variant("s", "public")}])
        log("ConnectDevice(public) OK")
    except Exception as e:
        log("ConnectDevice failed:", e)
        # 2) plain Connect
        try:
            await call(bus, PATH, "org.bluez.Device1", "Connect")
            log("Device1.Connect OK")
        except Exception as e2:
            log("Device1.Connect failed:", e2)
            return
    # wait for services
    for _ in range(60):
        p = await props(bus, PATH, "org.bluez.Device1")
        if p.get("ServicesResolved"):
            break
        await asyncio.sleep(0.5)
    log("connected", p.get("Connected"), "resolved", p.get("ServicesResolved"), "uuids", p.get("UUIDs"))
    objs = await managed(bus)
    chars = []
    for path, ifaces in sorted(objs.items()):
        if not path.startswith(PATH):
            continue
        if "org.bluez.GattService1" in ifaces:
            log("SVC", path.rsplit("/", 1)[-1], ifaces["org.bluez.GattService1"]["UUID"].value)
        if "org.bluez.GattCharacteristic1" in ifaces:
            c = ifaces["org.bluez.GattCharacteristic1"]
            flags = c["Flags"].value
            log("  CHR", path.rsplit("/", 1)[-1], c["UUID"].value, flags)
            chars.append((path, c["UUID"].value, flags))
    # read readable
    for path, uuid, flags in chars:
        if "read" in flags:
            try:
                v = await call(bus, path, "org.bluez.GattCharacteristic1", "ReadValue", "a{sv}", [{}])
                log("  READ", uuid, bytes(v[0]).hex(), bytes(v[0]))
            except Exception as e:
                log("  READ", uuid, "failed", e)
    # subscribe: listen for PropertiesChanged Value on every notify/indicate char
    def handler(msg):
        if msg.member != "PropertiesChanged" or msg.interface != "org.freedesktop.DBus.Properties":
            return
        iface, changed, _ = msg.body
        if iface == "org.bluez.GattCharacteristic1" and "Value" in changed:
            uuid = next((u for p, u, f in chars if p == msg.path), msg.path)
            log("NOTIFY", uuid, bytes(changed["Value"].value).hex())
        elif iface == "org.bluez.Device1" and "Connected" in changed:
            log("Device Connected ->", changed["Connected"].value)
    bus.add_message_handler(handler)
    await bus.call(Message(destination="org.freedesktop.DBus", path="/org/freedesktop/DBus",
                           interface="org.freedesktop.DBus", member="AddMatch", signature="s",
                           body=["type='signal',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged'"]))
    for path, uuid, flags in chars:
        if "notify" in flags or "indicate" in flags:
            try:
                await call(bus, path, "org.bluez.GattCharacteristic1", "StartNotify")
                log("  subscribed", uuid)
            except Exception as e:
                log("  StartNotify", uuid, "failed", e)
    log("listening", SECS, "s — take a measurement now")
    end = time.time() + SECS
    while time.time() < end:
        await asyncio.sleep(1)
    log("done")

asyncio.run(main())
