# aetosone Pi (192.168.20.127) — passwordless SSH key setup

**Date:** 2026-08-09
**Target:** `192.168.20.127:22`, user `aetosone`
**Target OS:** Ubuntu on Raspberry Pi — `Linux aetosone 7.0.0-1015-raspi #15-Ubuntu SMP PREEMPT_DYNAMIC aarch64`
**sshd:** OpenSSH_10.2p1 Ubuntu-2ubuntu3.5
**Status:** ✅ **Key installed and passwordless login verified**

---

## 1. Identities

| Item | Value |
|---|---|
| Key files | `claude` / `claude.pub` (project folder) |
| Type | ED25519, **no passphrase** |
| Key fingerprint | `SHA256:xmY4+HIasV4FgFSSSMcoVcWnn87GbpJAAPOKuL34jTU` |
| Public key comment | `claude-ssh` |
| Pi host key (ed25519) | `SHA256:wdQ0tWLhj2JSFwT4hSgpGKOHtqpfKmGdgwnoUo3h2XQ` |
| Pi account groups | `aetosone adm cdrom sudo dip video plugdev users lpadmin` (has sudo) |

Public key installed:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOSaoetTP56YmTPuMTVRki6F9SHjwyQ8x2gvaXhkJ2/2 claude-ssh
```

> Credentials note: the initially supplied password was wrong; the working one was supplied later in
> session. **Not recorded here on purpose** — this file lives in OneDrive. Rotate it if it is reused
> anywhere else, since it was transmitted on a plink command line (visible in the Windows process list).

## 2. Two blockers found and fixed

### Blocker A — wrong password (diagnosed, not a network issue)

First password attempt was rejected. Confirmed it was a genuine credential mismatch, not a firewall or
`AllowUsers`/`Match Address` restriction, by testing **four ways**: OpenSSH *and* plink, from *two*
different source hosts (cloud sandbox and the Windows PC at `192.168.20.10`). All four returned
`Permission denied` / `Access denied`. Server advertised `publickey,password` throughout.

### Blocker B — `~/.ssh` owned by root (the real problem)

```
drwx------  2 root  root  4096 Jul 27 19:30 /home/aetosone/.ssh
```

`/home/aetosone/.ssh` had been created **by root** (probably a setup script run under `sudo` on Jul 27),
so the `aetosone` user could not write into its own `.ssh`. `authorized_keys` did not exist.

⚠️ **This produced a false positive.** A naive `echo "$KEY" >> ~/.ssh/authorized_keys; echo INSTALLED`
printed `INSTALLED` even though the append had failed with `Permission denied`. Always verify with a
`grep -qxF` **after** the write — that check is in the script below.

Fix:

```bash
echo <password> | sudo -S -p '' chown -R aetosone:aetosone "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
```

## 3. What was done on the Pi

```bash
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOSaoetTP56YmTPuMTVRki6F9SHjwyQ8x2gvaXhkJ2/2 claude-ssh"
AK="$HOME/.ssh/authorized_keys"

sudo chown -R aetosone:aetosone "$HOME/.ssh"     # blocker B
chmod 700 "$HOME/.ssh"
touch "$AK"; chmod 600 "$AK"
grep -qxF "$KEY" "$AK" || echo "$KEY" >> "$AK"
grep -qxF "$KEY" "$AK" && echo VERIFIED || exit 1   # <-- verify, do not trust the append
```

Resulting state:

```
drwxr-x--- 16 aetosone aetosone 4096 /home/aetosone
drwx------  2 aetosone aetosone 4096 /home/aetosone/.ssh
-rw-------  1 aetosone aetosone   92 /home/aetosone/.ssh/authorized_keys
256 SHA256:xmY4+HIasV4FgFSSSMcoVcWnn87GbpJAAPOKuL34jTU claude-ssh (ED25519)
```

sshd config: no explicit `PubkeyAuthentication` / `PasswordAuthentication` / `AuthorizedKeysFile`
overrides — running on defaults. **Password auth is still enabled** (deliberately not disabled).

### Confirmed: key + password fallback both work

Effective server config via `sudo sshd -T` (authoritative — beats reading config files):

```
pubkeyauthentication          yes
passwordauthentication        yes
kbdinteractiveauthentication  no
permitrootlogin               prohibit-password
usepam                        yes
```

Only on-disk override is `KbdInteractiveAuthentication no` in `/etc/ssh/sshd_config`. That is
keyboard-interactive (PAM challenge-response), **not** plain password auth — password fallback is
unaffected.

Both paths tested independently by disabling the other client-side:

| Auth path | Client flags | Result |
|---|---|---|
| Key only | `-o PasswordAuthentication=no` | `KEY_AUTH_OK` |
| Password only | `-o PubkeyAuthentication=no -o PreferredAuthentications=password` | `PASSWORD_AUTH_OK` |

Note: `IdentitiesOnly yes` in the Windows `aetos-kiosk` alias only limits *which keys are offered* —
it does not block password fallback. ssh tries the `claude` key first, then prompts for a password
if the key is rejected.

## 4. Verification

```
$ ssh -i ~/.ssh/claude -o IdentitiesOnly=yes -o PreferredAuthentications=publickey \
      -o PasswordAuthentication=no -o BatchMode=yes aetosone@192.168.20.127 \
      'echo PASSWORDLESS_OK; whoami; hostname; uptime'

PASSWORDLESS_OK
aetosone
aetosone
 09:23:01 up 2 days, 18:40,  6 users,  load average: 3.41, 3.96, 4.10
```

`BatchMode=yes` + `PasswordAuthentication=no` means **no password fallback was possible** — this proves
key auth alone succeeded.

## 5. Windows client config (staged, blocked by a separate fault)

Done on `RK-DESKTOP` (`192.168.20.10`):

- `C:\Users\ramak\.ssh\claude` + `.pub` — copied, ACLs hardened
  (`icacls /inheritance:r`, then `ramak:(R)` only)
- `known_hosts` — Pi ed25519 host key pinned
- `config` — alias added:

```
Host aetos-kiosk
    HostName 192.168.20.127
    User aetosone
    Port 22
    IdentityFile ~/.ssh/claude
    IdentitiesOnly yes
```

Once OpenSSH is repaired (below), `ssh aetos-kiosk` should just work.

### 🔴 Separate pre-existing fault: Windows OpenSSH is broken

Every binary in `C:\Windows\System32\OpenSSH\` exits **255 producing zero bytes of output** —
including `ssh -V` and `ssh-keygen -l`, which cannot fail normally:

```
"C:\Windows\System32\OpenSSH\ssh.exe" -V  > v.txt 2>&1
ssh -V exit=255
--- v.txt size ---  0 bytes

ssh-keygen -l -f claude.pub    → keygen exit=255, no output
```

Binaries are present and correctly sized (`ssh.exe` 1,253,888 bytes, dated 30-01-2026). Zero-byte
output on `-V` points to the process dying before `main()` — most likely **AV/EDR blocking**, a
Windows Defender Application Control policy, or a broken optional-feature install.

**Not caused by this task.** Suggested repair:

```powershell
# as Administrator
Remove-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0
Add-WindowsCapability    -Online -Name OpenSSH.Client~~~~0.0.1.0
```

Then re-test: `ssh -V` should print `OpenSSH_for_Windows_x.x`.

### plink workaround (works today)

PuTTY at `C:\Program Files\PuTTY\` is functional and was used for all remote work this session.
Caveat: `plink -i` **cannot read new-format OpenSSH private keys** —

```
Unable to use key file "...\claude" (OpenSSH SSH-2 private key (new format))
```

Convert first, using the **PuTTYgen GUI** (`C:\Program Files\PuTTY\puttygen.exe` → Load `claude` →
Save private key → `claude.ppk`). The CLI conversion failed silently (exit 1, no output) because
puttygen is a GUI binary. Then:

```
plink -batch -ssh -P 22 -l aetosone -i C:\Users\ramak\.ssh\claude.ppk ^
  -hostkey "SHA256:wdQ0tWLhj2JSFwT4hSgpGKOHtqpfKmGdgwnoUo3h2XQ" 192.168.20.127 "hostname"
```

## 6. Operational notes

- Windows PC `192.168.20.10` and Pi `192.168.20.127` are on the same LAN; TCP 22 open both ways.
- The **cloud sandbox can also reach `192.168.20.127`** — useful, it means Linux-side `ssh`/`scp`
  against the Pi works directly without going through the Windows box.
- `aetos-meet` (161.97.79.175, Contabo) has **no route** to `192.168.20.0/24` — the Pi is not
  reachable from the Jitsi server.
- **Pi load average 3.41 / 3.96 / 4.10** at time of check. On a 4-core Pi that is ~100% saturated,
  sustained. Worth investigating separately.
- Password authentication left **enabled** on the Pi. Hardening (`PasswordAuthentication no`) was
  deliberately not applied — it risks lockout and was not requested.

## 7. Rollback

```bash
# on the Pi
sed -i '/claude-ssh$/d' ~/.ssh/authorized_keys
```

```powershell
# on Windows
Remove-Item C:\Users\ramak\.ssh\claude, C:\Users\ramak\.ssh\claude.pub
# and delete the "Host aetos-kiosk" block from C:\Users\ramak\.ssh\config
```
