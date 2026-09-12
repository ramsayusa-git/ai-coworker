import asyncio, sys, bleak
SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 30
seen = {}
def cb(dev, adv):
    key = dev.address
    new = key not in seen
    seen[key] = (dev, adv)
    if new or adv.local_name:
        print(f"{dev.address} name={adv.local_name!r} rssi={adv.rssi} uuids={adv.service_uuids} mfg={{ {', '.join(f'{k}:{v.hex()}' for k,v in adv.manufacturer_data.items())} }} sd={{ {', '.join(f'{k}:{v.hex()}' for k,v in adv.service_data.items())} }}", flush=True)
async def m():
    async with bleak.BleakScanner(cb):
        await asyncio.sleep(SECS)
asyncio.run(m())
