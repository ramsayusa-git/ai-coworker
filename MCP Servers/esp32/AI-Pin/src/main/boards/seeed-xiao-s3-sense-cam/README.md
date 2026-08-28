# Seeed Studio XIAO ESP32S3 Sense (camera, no display)

Built for the module identified on COM8 on 2026-08-26:
- Chip: ESP32-S3 (QFN56, rev v0.2), 8MB embedded PSRAM (Octal), native
  USB-Serial/JTAG, MAC 68:ee:8f:4f:51:dc.
- This matches the Seeed XIAO ESP32S3 Sense (camera + PDM mic add-on).

## Confirmed
- Camera pins: Seeed's official CAMERA_MODEL_XIAO_ESP32S3 pinout
  (DVP 8-bit, no PWDN/RESET wired). Auto-detects sensor at runtime —
  this specific unit reports as OV3660, not OV2640.
- Onboard PDM mic: CLK=GPIO42, DATA=GPIO41 (Sense expansion board).
- Speaker: external MAX98357A I2S Class-D amp on the AI-Pin carrier
  board, per the schematic in techiesms/AI-Pin- (Schematic-AI-Pin.pdf):
  LRCK=GPIO5 (XIAO D4), BCLK=GPIO6 (XIAO D5), DOUT=GPIO8 (XIAO D9).
  GAIN and SD are fixed in hardware (SD pulled up via R1, GAIN
  floating) — no GPIO control needed. Power/EN circuit on that same
  schematic (SW2 button + Q2/R2 latch feeding the XIAO's EN pin) is a
  board-level concern only, not reflected in this firmware config.

## Needs confirmation
- BUILTIN_LED_GPIO assumed GPIO21 (XIAO ESP32S3 user LED) — not shown
  on the techiesms schematic, unverified.

## Build

```powershell
idf.py set-target esp32s3
idf.py menuconfig   # Xiaozhi Assistant -> Board Type -> seeed-xiao-s3-sense-cam
                     # Component config -> ESP PSRAM -> Octal Mode PSRAM
idf.py build
```

## Flash (COM8)

```powershell
idf.py -p COM8 flash monitor
```
