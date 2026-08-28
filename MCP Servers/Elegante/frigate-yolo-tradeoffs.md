# Frigate detector: SSD → YOLO trade-offs (Aetos One / elegante)

Assessed 2026-08-04 against the live instance. Frigate **0.17.2**, HAOS on `generic-x86-64`, single camera `fd_camera`.

## What you run today

```yaml
detectors:
  cpu1:
    type: cpu
    model:
      path: /cpu_model.tflite   # SSDLite MobileDet, 320×320
      model_type: ssd
```

| | |
|---|---|
| Inference speed | **10 ms** (reported by `/api/stats`) |
| Detect stream | 640×360 @ 5 fps, sub-stream |
| Tracked objects | `person` only |
| Thresholds | `min_score 0.5`, `threshold 0.7` |
| Observed person scores | 0.77 – 0.82 |

This is Frigate's **fallback** detector. The docs are explicit: *"CPU Detector (not recommended for actual use) … in most cases OpenVINO can be used in CPU mode with better results."*

## The three realistic options

### A. OpenVINO + the bundled SSDLite MobileNet v2 — the free win

Not YOLO, but worth naming because it costs nothing and is the docs' own recommendation. Same model family you already run, executed through OpenVINO instead of tflite. Model ships **inside the container** — no download, no `model_cache`.

```yaml
detectors:
  ov:
    type: openvino
    device: GPU        # or CPU
model:
  width: 300
  height: 300
  input_tensor: nhwc
  input_pixel_format: bgr
  path: /openvino-model/ssdlite_mobilenet_v2.xml
  labelmap_path: /openvino-model/coco_91cl_bkgr.txt
```

**Pros** — near-zero risk, instant rollback, likely faster than 10 ms on the iGPU, frees CPU.
**Cons** — accuracy is roughly what you have now. Doesn't solve missed/low-confidence detections.

### B. OpenVINO + YOLOv9 — the accuracy upgrade

Docs list YOLOv9 as **"Recommended for GPU & NPU"** on OpenVINO.

```yaml
detectors:
  ov:
    type: openvino
    device: GPU
model:
  model_type: yolo-generic
  width: 320
  height: 320
  input_tensor: nchw
  input_dtype: float
  path: /config/model_cache/yolo.onnx
```

**Pros** — materially better accuracy than MobileDet, especially small/partial/backlit figures. Your camera is an IR staircase view at 640×360, which is exactly where MobileDet is weakest. Higher scores mean you could raise `threshold` and cut false alerts, and the vision-LLM leg stops burning cloud calls on marginal events.
**Cons** — you must source and convert the ONNX yourself. Inference will be slower than 10 ms; at 5 fps on one camera there's a lot of headroom, but it needs measuring. `hwaccel_args: [-hwaccel, none]` stays — that's the ffmpeg decode path and unrelated to the detector.

### C. ONNX/YOLO on CPU — not recommended here

Works, no GPU dependency, trivially reversible. But on this box it's the slowest path by a wide margin and may not hold 5 fps. If option B's GPU device fails to initialise, `device: CPU` under OpenVINO is the better fallback than a raw ONNX CPU detector.

## Hardware caveats — verify before committing

1. **OpenVINO needs 6th-gen Intel (Skylake) or newer** for the `GPU` device. Prior notes record this CPU as **lacking AVX2**, which points at an Atom/Celeron-class part. Confirm before assuming `device: GPU` works.
2. **`/dev/dri` must be passed through.** The Frigate add-on is Full Access with `video: true`, so this should already be satisfied — but the VAAPI failure last time (`Failed to sync surface`, `hwdownload`) proves the iGPU path on this box is not healthy for *decode*. Inference is a different code path and may well be fine; that is an assumption to test, not to trust.
3. **YOLO-NAS is explicitly documented as running poorly on integrated GPUs.** If you go YOLO, go YOLOv9 — not NAS.

Run this in the Terminal add-on to settle 1 and 2:

```bash
lscpu | grep -E 'Model name|Flags' | cut -c1-200
ls -l /dev/dri
```

## Recommendation

Sequence it: **A first, then B.** Switching to OpenVINO with the bundled model proves the GPU device initialises and gives you a clean baseline inference number, at essentially zero risk. Only once that's green is it worth sourcing the YOLOv9 ONNX. Attempting B cold means a model problem and a device problem are indistinguishable.

**Blocker:** none of this is testable right now — the camera has been off the network since 2026-08-03 05:52. Fix that first, or you'll be tuning a detector with no frames to detect on.
