"""Pure-Python DSP for the ecg2 stream: IIR biquads, mains notch, band-pass,
a Pan-Tompkins-style QRS detector and a simple signal-quality estimate.
No numpy/scipy so the image stays small on armv7/aarch64 Alpine."""
from __future__ import annotations

import math
from collections import deque


class Biquad:
    """Direct-form-II transposed biquad."""

    __slots__ = ("b0", "b1", "b2", "a1", "a2", "z1", "z2")

    def __init__(self, b0, b1, b2, a0, a1, a2):
        self.b0, self.b1, self.b2 = b0 / a0, b1 / a0, b2 / a0
        self.a1, self.a2 = a1 / a0, a2 / a0
        self.z1 = self.z2 = 0.0

    def process(self, x: float) -> float:
        y = self.b0 * x + self.z1
        self.z1 = self.b1 * x - self.a1 * y + self.z2
        self.z2 = self.b2 * x - self.a2 * y
        return y

    def reset(self):
        self.z1 = self.z2 = 0.0

    # --- RBJ cookbook designs -------------------------------------------
    @classmethod
    def notch(cls, fs: float, f0: float, q: float = 30.0) -> "Biquad":
        w0 = 2 * math.pi * f0 / fs
        alpha = math.sin(w0) / (2 * q)
        c = math.cos(w0)
        return cls(1, -2 * c, 1, 1 + alpha, -2 * c, 1 - alpha)

    @classmethod
    def lowpass(cls, fs: float, fc: float, q: float = 0.7071) -> "Biquad":
        w0 = 2 * math.pi * fc / fs
        alpha = math.sin(w0) / (2 * q)
        c = math.cos(w0)
        return cls((1 - c) / 2, 1 - c, (1 - c) / 2, 1 + alpha, -2 * c, 1 - alpha)

    @classmethod
    def highpass(cls, fs: float, fc: float, q: float = 0.7071) -> "Biquad":
        w0 = 2 * math.pi * fc / fs
        alpha = math.sin(w0) / (2 * q)
        c = math.cos(w0)
        return cls((1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + alpha, -2 * c, 1 - alpha)


class EcgFilter:
    """Display filter chain: HP 0.5 Hz (baseline wander) -> mains notch (+ 2nd
    harmonic) -> LP 40 Hz. Returns the filtered sample."""

    def __init__(self, fs: float, mains_hz: int = 50):
        self.fs = fs
        self.stages = [
            Biquad.highpass(fs, 0.5),
            Biquad.notch(fs, mains_hz, 25.0),
            Biquad.notch(fs, mains_hz * 2, 25.0),
            Biquad.lowpass(fs, 40.0),
        ]

    def process(self, x: float) -> float:
        for s in self.stages:
            x = s.process(x)
        return x

    def reset(self):
        for s in self.stages:
            s.reset()


class QrsDetector:
    """Pan-Tompkins-lite. Polarity independent (squares the derivative), so a
    lead that shows QRS as negative spikes (as the ecg2 does) still works.

    Feed *filtered* samples via process(); it returns True on a detected beat.
    hr_bpm / rr_ms expose the running estimate."""

    def __init__(self, fs: float):
        self.fs = fs
        self.bp = [Biquad.highpass(fs, 5.0), Biquad.lowpass(fs, 20.0)]
        self.win = max(1, int(0.150 * fs))          # 150 ms integration window
        self.refractory = int(0.300 * fs)           # 300 ms (max 200 bpm)
        self.buf = deque(maxlen=self.win)
        self.integ_sum = 0.0
        self.prev = 0.0
        self.n = 0
        self.last_peak_n = -10 ** 9
        self.spk = 0.0      # running signal peak
        self.npk = 0.0      # running noise peak
        self.thr = 0.0
        self.rr = deque(maxlen=8)
        self.hr_bpm: float | None = None
        self.rr_ms: float | None = None
        self.beats = 0
        self._local_max = 0.0
        self._local_max_n = 0
        self._rising = False

    def reset(self):
        self.__init__(self.fs)

    def process(self, x: float) -> bool:
        self.n += 1
        for s in self.bp:
            x = s.process(x)
        d = x - self.prev
        self.prev = x
        e = d * d
        if len(self.buf) == self.buf.maxlen:
            self.integ_sum -= self.buf[0]
        self.buf.append(e)
        self.integ_sum += e
        y = self.integ_sum / self.win

        beat = False
        # warm-up: learn thresholds for the first 2 s
        if self.n < 2 * self.fs:
            self.spk = max(self.spk * 0.999, y)
            self.thr = 0.25 * self.spk
            return False

        # peak tracking: detect a local maximum of the integrated signal
        if y > self._local_max:
            self._local_max = y
            self._local_max_n = self.n
            self._rising = True
        elif self._rising and y < 0.5 * self._local_max:
            # local max is over — classify it
            pk, pk_n = self._local_max, self._local_max_n
            self._local_max = 0.0
            self._rising = False
            if pk_n - self.last_peak_n > self.refractory and pk > self.thr:
                if self.last_peak_n > 0:
                    rr = (pk_n - self.last_peak_n) / self.fs
                    if 0.3 <= rr <= 2.0:
                        self.rr.append(rr)
                        self.rr_ms = rr * 1000
                        self.hr_bpm = 60.0 / (sum(self.rr) / len(self.rr))
                self.last_peak_n = pk_n
                self.spk = 0.125 * pk + 0.875 * self.spk
                self.beats += 1
                beat = True
            else:
                self.npk = 0.125 * pk + 0.875 * self.npk
            self.thr = self.npk + 0.25 * (self.spk - self.npk)
        # missed-beat search-back: if no beat for 1.66x mean RR, lower threshold
        if self.rr and (self.n - self.last_peak_n) > 1.66 * (sum(self.rr) / len(self.rr)) * self.fs:
            self.thr *= 0.5
        return beat


class SignalQuality:
    """Cheap quality estimate over a sliding 2 s window of *raw* samples:
    flat line / rail saturation / excessive high-frequency noise."""

    def __init__(self, fs: float):
        self.fs = fs
        self.win = deque(maxlen=int(2 * fs))
        self.diff = deque(maxlen=int(2 * fs))
        self.prev = None

    def push(self, x: float):
        self.win.append(x)
        if self.prev is not None:
            self.diff.append(abs(x - self.prev))
        self.prev = x

    def assess(self) -> tuple[str, float]:
        """Returns (label, score 0..1)."""
        if len(self.win) < self.fs:
            return "warming", 0.0
        lo, hi = min(self.win), max(self.win)
        span = hi - lo
        if span < 20:
            return "flat", 0.0
        if lo <= -32000 or hi >= 32000:
            return "saturated", 0.1
        mean_diff = sum(self.diff) / max(1, len(self.diff))
        # ratio of sample-to-sample jitter to overall span: high => noisy
        ratio = mean_diff / span
        if ratio > 0.12:
            return "noisy", max(0.0, 0.6 - ratio)
        if ratio > 0.06:
            return "fair", 0.7
        return "good", 1.0
