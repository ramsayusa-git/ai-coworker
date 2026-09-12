"""Connect to the BP monitor, dump GATT, subscribe to every notify/indicate char and
log all traffic for N seconds. usage: bp_probe.py ADDR SECS"""
import asyncio, sys, time, bleak
ADDR = sys.argv[1]; SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 90
t0 = time.time()
def log(*a): print(f"{time.time()-t0:7.2f}", *a, flush=True)
async def main():
    log("scanning for", ADDR)
    dev = None
    while dev is None and time.time() - t0 < 600:
        dev = await bleak.BleakScanner.find_device_by_address(ADDR, timeout=10)
    if not dev:
        log("not found (not advertising)"); return
    log("found", dev.name, dev.address)
    async with bleak.BleakClient(dev, timeout=25) as c:
        log("connected mtu", getattr(c, "mtu_size", None))
        for s in c.services:
            log(f"SVC {s.uuid} {s.description}")
            for ch in s.characteristics:
                log(f"  CHR {ch.uuid} h={ch.handle} props={','.join(ch.properties)} {ch.description}")
                for d in ch.descriptors:
                    log(f"     DSC {d.uuid} h={d.handle}")
                if "read" in ch.properties:
                    try:
                        v = await c.read_gatt_char(ch)
                        log(f"     READ {ch.uuid} = {bytes(v).hex()} {bytes(v)!r}")
                    except Exception as e:
                        log(f"     READ {ch.uuid} failed: {e}")
        subs = []
        for s in c.services:
            for ch in s.characteristics:
                if "notify" in ch.properties or "indicate" in ch.properties:
                    def mk(u):
                        return lambda _h, data: log(f"NOTIFY {u} len={len(data)} {bytes(data).hex()}")
                    try:
                        await c.start_notify(ch, mk(ch.uuid)); subs.append(ch.uuid); log("subscribed", ch.uuid)
                    except Exception as e:
                        log("subscribe failed", ch.uuid, e)
        log("listening", SECS, "s — take a measurement now")
        end = time.time() + SECS
        while time.time() < end and c.is_connected:
            await asyncio.sleep(0.5)
        log("done, connected =", c.is_connected)
asyncio.run(main())
