# 🎶 AIRWAVES

**Play music with your bare hands.** Your webcam tracks your hands — **height picks
the note, pinch swells it, sideways opens the tone**. Two hands = two voices. It's
quantized to a musical scale, so you *can't* play a wrong note.

Hand tracking runs **100% on-device** (MediaPipe Hand Landmarker + WebGPU); the
synth is pure Web Audio. Nothing is uploaded. A sibling of
[AIRSLICE](https://airslice.dorkalev.com) / AIRMASK.

## Run it
```bash
npx serve public   # then open the http://localhost:… URL in desktop Chrome/Edge
```
Allow the camera, hit START, raise a hand. Toolbar toggles **scale** (major /
minor-pentatonic / lydian / japanese) and **tone** (warm / pure / reed / glass).

## How it works
- `MediaPipe HandLandmarker` → 21 landmarks per hand, on-device.
- Index-fingertip **height → scale degree** (quantized), **pinch (thumb↔index) →
  volume + filter**, **x → pan**, with portamento so it glides musically.
- Two `OscillatorNode` voices → lowpass → stereo pan → a feedback-delay space.

## Recording (optional)
Sessions can be captured to a small public gallery (Firebase Storage — no
database). It's **off unless configured**: fill `public/config.js` with your own
Firebase web config to turn it on, or leave it blank to run just the instrument.
`admin.html` is a moderation page gated to `ADMIN_EMAIL`.

## License
[MIT](LICENSE). Hand tracking via Google MediaPipe Tasks.
