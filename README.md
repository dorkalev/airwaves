# 🎶 AIRWAVES

**Play music with your bare hands.** A webcam watches your hands, on-device ML
turns them into gestures, and a Web Audio synth turns those into sound — no
controller, no MIDI, no install. It's quantized to a scale, so you *can't* play
a wrong note.

**▶ Live: [airwaves.dorkalev.com](https://airwaves.dorkalev.com)**
· Desktop Chrome/Edge + a webcam · a sibling of [AIRSLICE](https://airslice.dorkalev.com)

---

## Part 1 — Product

### What it is
AIRWAVES is a hands-in-the-air instrument that runs entirely in a browser tab.
Raise a hand and you're playing. Everything — camera, tracking, sound — happens
on your machine; nothing about your camera leaves the tab for the instrument to
work.

But AIRWAVES is really two products in one page:

1. **The instrument** — the thing you play.
2. **A playable changelog** — the story of how the instrument was invented,
   where every step is itself playable.

### The playable changelog
The home page isn't a landing page; it's the build log. AIRWAVES was made
**live, one prompt at a time**, and the site shows all fifteen versions in
order — each with *the exact message that caused it*, what changed, and a **live,
playable preview** on the right. You don't read that "v11 became a launchpad" —
you open v11 and play it.

| | version | the move |
|---|---|---|
| `/v0`  | the air instrument      | a theremin — hand height = pitch, pinch = volume |
| `/v1`  | finger-tap piano        | thumb-to-finger taps fire fixed notes, an octave across two hands |
| `/v2`  | sustain + debounce      | hold to sustain; stop the machine-gun retriggering |
| `/v3`  | looser + a dial         | overcorrected → loosen, add a live sensitivity toggle |
| `/v4`  | memory between frames    | track each hand frame-to-frame — where it started to feel solid |
| `/v5`  | require a real touch    | a note only fires on a genuine thumb-to-finger contact |
| `/v6`  | the thumb becomes a line | thumb is just a reference line; a finger sounds when it crosses it |
| `/v7`  | laid out like a keyboard | screen split low→high, fingers ascending like piano keys |
| `/v8`  | open hand = stop        | splay your hand and that hand goes silent |
| `/v9`  | an on-screen piano      | a real keyboard on screen; any fingertip on a key plays it |
| `/v10` | centered & transparent  | smaller, see-through piano so your hands read through it |
| `/v11` | the air deck            | ditch precision — a launchpad + beat that re-fires held pads |
| `/v12` | the air looper          | record your **real** voice/guitar and stack loops by hand |
| `/v13` | looper, but simple      | rip out the state machine: pinch to record, pinch to loop, pinch to clear |
| `/v14` | pads on top             | move the pads up so the camera view stays clear |

### The turn
Around v12 the product changes its mind. Chasing a "better instrument" was
producing something lacking. So it stopped trying to *replace* reality and
became a **top-layer on** it: loop your actual voice, your actual guitar, and
conduct the layers with your hands. The game becomes a place to augment what you
already do, not a worse substitute for it.

### Sessions & gallery (optional)
Playing can be recorded to a small public gallery, so the instrument has an
audience and a memory:
- On start you choose **"Start + record"** or a quiet **"skip recording."**
- A countdown ("Use your hands to play!" → 3 · 2 · 1 → "record starts!") gives
  you a beat to get ready before capture begins.
- Clips **stream** to the gallery every few seconds while you play, tagged with
  the version they came from. You can **remove your own** anytime; an admin page
  can moderate all.

---

## Part 2 — The principle

> This project is built around a belief, and the belief comes from Bret Victor's
> talk **[Inventing on Principle](https://www.youtube.com/watch?v=PUv66718DII)** (2012).

Victor's argument, in one line: **creators need an immediate connection to what
they create.** When the gap between an action and seeing its effect shrinks to
zero, you stop guessing and start *discovering* — you notice things you never
would have planned. He also makes a second point: find a principle you actually
believe in, and let it drive the work.

AIRWAVES takes that literally, twice:

- **In the instrument.** Motion → sound with no perceptible loop: tracking and
  synthesis run on-device, so there's no server round-trip between your hand and
  the note. You're not operating a UI that eventually makes sound — you feel
  directly connected to the sound you're shaping. That directness *is* the
  instrument.

- **In how it's presented.** A normal changelog *describes* changes; you have to
  imagine them. AIRWAVES makes the changelog itself an immediate connection —
  every past version is live and playable next to the prompt that produced it.
  You experience the effect of each idea instead of reading about it. The history
  of the tool is explorable with the same immediacy the tool is played with.

Referencing the talk isn't decoration — it's the design spec. If a feature
widened the gap between doing and sensing the result, it was wrong (that's what
v2–v4 are: closing a feedback loop that had opened up). If it narrowed it, it
stayed. The v12 "augment, don't replace" turn is the second half of Victor's
talk in practice: a principle, followed even when it meant discarding the
earlier direction.

---

## Part 3 — Tech

### At a glance
```
webcam ─▶ MediaPipe Hand Landmarker (on-device, WebGPU)
       ─▶ 21 landmarks/hand, tracked frame-to-frame (smoothed, coasted)
       ─▶ gesture → note/gate mapping, quantized to a scale
       ─▶ Web Audio graph (oscillators / looper DSP → filter → delay)
       ─▶ canvas + audio, optionally recorded to a shared gallery
```
Pure client-side. No build step — static HTML/JS/CSS served from `public/`.

### Hand tracking
- `@mediapipe/tasks-vision` **HandLandmarker**, GPU delegate (WebGPU), fully
  on-device — camera frames never leave the tab.
- The early versions' real bug was a fast render loop recomputing against stale
  camera frames. Fixed by giving each hand a **persistent identity across
  frames**, EMA-smoothing the landmarks, and **coasting** through dropped frames
  — the difference between "twitchy" and "playable" (see `/v4`).

### Sound
- **Web Audio API** throughout: oscillator voices with portamento, lowpass +
  stereo pan into a feedback-delay space; the looper (v12+) is a
  `ScriptProcessorNode` DSP recording/playing loop buffers against one transport.
- Everything is **quantized** to the selected scale and (in the deck/looper) to
  the beat, so the output stays musical regardless of timing.

### Recording pipeline (optional)
Firebase **Storage-as-a-database** — no database server:
- Capture a **downscaled** copy of the app canvas (≈426px, ~600 kbps VP9) plus
  audio (tapped generically by wrapping `AudioContext.prototype.connect`), via
  `MediaRecorder`.
- **"Stream" without append complexity:** re-upload the growing clip to one
  fixed filename every ~5s, so a session is continuously saved without relying
  on a clean close.
- Filenames encode an **inverted timestamp** (so a lexicographic `list()` is
  newest-first) **and the version** (`…__v14.webm`). A poster JPEG is stored
  alongside.
- **App Check** (reCAPTCHA v3) + **anonymous auth** gate writes; ownership is
  tracked in `localStorage` and stamped in file metadata for the Storage rules.
  `admin.html` is a moderation view gated to an admin email via Google sign-in.

### Hosting & routes
Firebase Hosting (`cleanUrls`), with a client-side canonical-domain redirect:
- `/` → the playable changelog (home)
- `/v0` … `/v14` → the individual versions
- `/play` → the standalone current instrument
- `/admin` → session moderation

### Analytics
Google Analytics (GA4) via a single `site.js` on every page — deliberately
*not* named `analytics.js` (ad-blockers neuter that filename), and gated to the
project's own domains so a fork never reports to this property.

### Fork / self-host
The instrument needs no backend. Recording is **opt-in**:
```bash
npx serve public        # open the printed http://localhost:… in Chrome/Edge
```
- Leave `public/config.js` blank → just the instrument (the recording layer
  turns itself off — no UI, no network).
- To enable the gallery, drop your **own** Firebase web config into
  `config.js`, set `ADMIN_EMAIL`, and a `DEMO` namespace.
- Set `GA_ID` / the canonical host in `site.js`, or leave them — they only
  activate on their configured domains.

## License
[MIT](LICENSE). Hand tracking by [Google MediaPipe](https://ai.google.dev/edge/mediapipe);
sound via the Web Audio API. Built by [Dor Kalev](https://dorkalev.com).
