# aetos-meet — 16 GB swap added + health baseline

**Date:** 2026-08-09
**Host:** `aetos-meet` (Ubuntu 24.04.4 LTS, kernel 6.8.0-124-generic, x86_64, 4 vCPU, 7.8 GB RAM)
**Connector used:** `aetos-meet-linux-mcp` (`7e31ed94-4c30-4eaf-8c49-306f31ecc5f8`, https://aetosmeet.mcp.aetosiot.com/mcp)

---

## 1. Why

Server had **zero swap**. With 7.8 GB RAM shared by JVB, jicofo, jigasi, jibri, Vosk, nginx, prosody
and a Node portal, a single memory spike had no safety net — the OOM killer would have taken a live
meeting process. Swap added as an OOM buffer, not as working memory.

## 2. Health baseline (before change)

| Check | Value | Status |
|---|---|---|
| Load avg (4 cores) | 0.00 / 0.03 / 0.00 | Idle |
| Uptime | 20 d 23 h | Stable |
| Disk `/` (`/dev/sda1`) | 17 G / 72 G (23 %) | Healthy |
| RAM | 4.0 G / 7.8 G used, 3.8 G available | OK |
| Swap | **0 B** | Missing — fixed below |
| Failed units | none observed | OK |

### Services confirmed running

| Service | PID | Notes |
|---|---|---|
| prosody (`lua5.4`) | 1457712 | XMPP :5222 / :5269 / :5280 / :5281 |
| jicofo | 1131120 | `-Xmx3072m`, health :8888 |
| jitsi-videobridge | 1458272 | `-Xmx3072m -XX:+UseG1GC`, :8080 |
| jigasi | 1131197 | `--domain=meet.dash.aetosiot.com` |
| jibri | 1132120 | + Xorg dummy :0 (PID 1131143) |
| vosk asr_server | 1457672 | `/opt/vosk/asr_server.py`, :2700 |
| nginx | 1458265-70 | :80, :443 |
| node portal | 1425320 | `server/server.js`, :4000 |
| python | 97295 | :3010 |
| dockerd / containerd | 34149 / 1769152 | |

### `/opt` layout

```
/opt/containerd  /opt/google  /opt/jitsi  /opt/jitsi-frontend  /opt/linux-mcp-suite  /opt/vosk
```

## 3. Environment note (important for future work)

The MCP runs inside a **privileged Docker container** (`/.dockerenv` present, `CapEff=000001ffffffffff`,
uid 0) that shares the host PID namespace and bind-mounts the host root filesystem at **`/host`**.

- Container `/host` == host `/`   (`/dev/sda1`, `LABEL=cloudimg-rootfs`)
- Container `/opt` == host `/opt` (same device)

**So: to edit host files, write to `/host/<path>`, but reference them as `/<path>` in any host config
(fstab, systemd units, etc.).** Swap is kernel-global and not namespaced, so `swapon` from inside the
container takes effect on the host.

## 4. Change applied

### Decisions taken (confirmed with Ramsay)

| Question | Choice |
|---|---|
| Swap size | **16 GB (2× RAM)** |
| `vm.swappiness` | **Leave at 60** (default, unchanged) |
| Persist across reboot | **Yes** |

### Commands run

```bash
# 1. Create the swapfile on the HOST filesystem.
#    dd (not fallocate) — fallocate leaves unwritten extents that swapon can reject.
dd if=/dev/zero of=/host/swapfile bs=1M count=16384 status=none
chmod 600 /host/swapfile

# 2. Format + activate
mkswap  /host/swapfile
swapon  /host/swapfile

# 3. Persist (note: host path is /swapfile, NOT /host/swapfile)
cp -a /host/etc/fstab /host/etc/fstab.bak.20260809-033610
printf '/swapfile\tnone\tswap\tsw\t0 0\n' >> /host/etc/fstab
```

### Resulting `/etc/fstab` (host)

```
LABEL=cloudimg-rootfs	/	 ext4	discard,commit=30,errors=remount-ro	0 1
LABEL=BOOT	/boot	ext4	defaults	0 2
LABEL=UEFI	/boot/efi	vfat	umask=0077	0 1
/swapfile	none	swap	sw	0 0
```

Backup of the original: **`/etc/fstab.bak.20260809-033610`**

### Verification

```
$ swapon --show
NAME           TYPE SIZE USED PRIO
/host/swapfile file  16G   0B   -2

$ free -h
               total        used        free      shared  buff/cache   available
Mem:           7.8Gi       3.8Gi       123Mi       1.9Mi       4.1Gi       3.9Gi
Swap:           15Gi          0B        15Gi
```

Boot-path validated in the host mount namespace:

```
$ nsenter -t 1 -m -- swapon --fstab /etc/fstab --all --verbose
swapon: /swapfile: found signature [pagesize=4096, signature=swap]
swapon: /swapfile: pagesize=4096, swapsize=17179869184, devsize=17179869184
swapon: /swapfile: swapon failed: Device or resource busy
```

`Device or resource busy` is the **expected pass result** — the host resolved `/swapfile`, found a
valid swap signature and a matching 16 GiB size, and declined only because it is already active.
Confirms the fstab entry will mount cleanly on reboot.

### Disk impact

`/` went from 17 G / 72 G (23 %) → **33 G / 72 G (46 %)**, 40 G free.

## 5. Open items / follow-ups

1. **Stale `webpack` dev server — PID 192845.** Running since **Jul 19** (21 days), holding
   **2.0 GB RSS = 24.8 % of total RAM**, more than the videobridge itself. Listening on `:8081`.
   This is the frontend dev server (see `aetos-frontend-dev-server.md`). Killing it frees ~2 GB.
   **Not actioned — awaiting confirmation.**

2. **`vm.swappiness` is 60.** Left at the kernel default by choice. Caveat for the record: at 60 the
   kernel will page out idle JVB/jicofo Java heap fairly readily. If audio/video stutter appears right
   after a busy period, suspect this first. Live fix, no restart needed:

   ```bash
   sysctl -w vm.swappiness=10
   echo 'vm.swappiness=10' > /host/etc/sysctl.d/99-swappiness.conf   # persist
   ```

3. **Not done deliberately:** did not create swap "as large as possible". 56 GB of swap on a 7.8 GB
   real-time media host would let the kernel page out live WebRTC threads and spike latency. 16 GB is
   the agreed ceiling.

## 6. Rollback

```bash
swapoff /host/swapfile
rm -f   /host/swapfile
cp -a   /host/etc/fstab.bak.20260809-033610 /host/etc/fstab
```
