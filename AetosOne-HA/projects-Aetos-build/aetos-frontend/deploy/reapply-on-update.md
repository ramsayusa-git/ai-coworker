# Make the branded frontend survive HA core updates

A core update reinstalls the stock `hass_frontend`, wiping your branded wheel.
Two options:

## Option 1 — Manual (simplest)
After each HA core update, re-run `deploy/deploy-to-haos.sh` with the wheel URL
built for the **matching** frontend version. (Bump `FRONTEND_REF` in
`branding/config.env`, let the Action rebuild, then deploy.)

## Option 2 — Auto-reapply on start (HAOS)
Add this package on lab01 as `/config/packages/aetos_frontend_reapply.yaml`.
It reinstalls a wheel stored at `/config/aetos/aetos_frontend.whl` on every start.
(You still update that wheel file whenever you bump HA versions.)

```yaml
shell_command:
  aetos_reinstall_frontend: >-
    pip install --no-deps --force-reinstall /config/aetos/aetos_frontend.whl

automation:
  - id: aetos_reinstall_frontend_on_start
    alias: "Aetos One - reinstall branded frontend on start"
    trigger:
      - platform: homeassistant
        event: start
    action:
      - service: shell_command.aetos_reinstall_frontend
    mode: single
```

> Note: `shell_command` runs inside the HA core container, where `pip` and
> `/config` are available. After it runs on a fresh boot the branded frontend
> is restored within a few seconds. First paint after an update may briefly show
> stock branding until the reinstall + a refresh.

## Caveat
The wheel is version-locked to a frontend release. When HA bumps the frontend,
an old branded wheel may not match — rebuild it against the new `FRONTEND_REF`.
This is the ongoing maintenance you accepted by choosing the fork route.
