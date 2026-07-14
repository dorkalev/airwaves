// Shared recording layer for every AIRWAVES version.
//  - consent popup on first load (choice remembered); a persistent toggle to flip it
//  - auto-captures the page's canvas + audio and uploads to the shared gallery
//  - a 🖼 gallery button (remove-your-own)
// Audio is captured generically by tapping every AudioContext's connection to
// its destination — so it works on any version without editing the app.
import { sessionName, uploadTo, deleteByName, listSessions, getUrl, getPosterUrl, deleteSession, rememberMine, forgetMine, isMine } from './firebase.js?v=2';

// ---- tap all app audio: mirror any -> ctx.destination into a capture node ----
(function () {
  const N = window.AudioContext || window.webkitAudioContext; if (!N || N.__airPatched) return;
  window.__airCtxs = [];
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    const out = orig.call(this, dest, ...rest);
    try {
      const c = this.context;
      if (dest && c && dest === c.destination) {
        if (!c.__cap) { c.__cap = c.createMediaStreamDestination(); window.__airCtxs.push(c); }
        orig.call(this, c.__cap);
      }
    } catch (e) {}
    return out;
  };
  N.__airPatched = true;
})();
const audioTracks = () => { const t = []; (window.__airCtxs || []).forEach(c => { try { c.__cap.stream.getAudioTracks().forEach(x => t.push(x)); } catch (e) {} }); return t; };

const LS = 'air-rec-consent';
let consent = localStorage.getItem(LS);   // 'on' | 'off' | null
let recorder = null, chunks = [], done = false, capT = null, armed = false;
let sessionPath = null, posterDone = false, flushT = null, flushing = false, stopCopy = null;

// ---- UI ----
const style = document.createElement('style');
style.textContent = `
  #airbar { position:fixed; left:12px; bottom:12px; z-index:9999; display:flex; gap:8px; font-family:'Fragment Mono',monospace; }
  #airbar button { cursor:pointer; font-size:12px; border-radius:20px; padding:7px 12px; border:1px solid #ffffff22; background:#12121ecc; color:#cfe; backdrop-filter:blur(4px); }
  #airToggle.on { color:#ff8aa8; border-color:#ff2e8855; } #airToggle.off { color:#8a94a5; }
  #airToggle .dot { display:none; } #airToggle.rec .dot { display:inline; animation:airblink 1s steps(1) infinite; }
  @keyframes airblink { 50% { opacity:.25; } }
  #airConsent, #airGallery { position:fixed; inset:0; z-index:10000; display:grid; place-items:center; background:#0a0a12dd; backdrop-filter:blur(6px); font-family:'Fragment Mono',monospace; color:#e8ebf0; padding:20px; }
  #airConsent .c { max-width:440px; text-align:center; background:#12121e; border:1px solid #ffffff1c; border-radius:16px; padding:26px; }
  #airConsent h3 { font-family:'Bangers',cursive; font-size:30px; color:#29f4ff; margin-bottom:10px; letter-spacing:.03em; }
  #airConsent p { font-size:13px; line-height:1.7; color:#c7ccd6; } #airConsent b { color:#fff; }
  #airConsent .b { display:flex; gap:10px; justify-content:center; margin-top:20px; }
  #airConsent button { cursor:pointer; font-size:14px; border-radius:10px; padding:11px 20px; border:1px solid #ffffff22; background:transparent; color:#cfe; }
  #airConsent #cOn { background:#b6ff2e; color:#0a0a12; border:none; font-weight:bold; }
  #airGallery .gw { width:min(1000px,94vw); max-height:88vh; display:flex; flex-direction:column; background:#0c0c14; border:1px solid #ffffff1c; border-radius:16px; overflow:hidden; }
  #airGallery .gt { display:flex; justify-content:space-between; align-items:center; padding:12px 16px; font-family:'Bangers',cursive; font-size:22px; color:#29f4ff; border-bottom:1px solid #ffffff14; }
  #airGallery .gt button { cursor:pointer; font-family:'Fragment Mono',monospace; font-size:12px; color:#ff8aa8; background:transparent; border:1px solid #ff2e8855; border-radius:8px; padding:5px 11px; }
  #airGallery .gg { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; padding:16px; overflow-y:auto; }
  #airGallery .sc { background:#12121e; border:1px solid #ffffff14; border-radius:12px; overflow:hidden; position:relative; }
  #airGallery .sc video { width:100%; aspect-ratio:4/3; object-fit:cover; background:#000; display:block; cursor:zoom-in; }
  #airGallery .sc .m { padding:7px 10px; font-size:11px; color:#9aa; }
  #airGallery .sc .rm { position:absolute; top:8px; right:8px; font-size:11px; color:#ff8aa8; background:#000000cc; border:1px solid #ff2e8855; border-radius:7px; padding:3px 8px; cursor:pointer; }
  #airGallery .gm { text-align:center; color:#778; font-size:12px; padding:0 0 14px; }
  #airToast { position:fixed; left:12px; bottom:56px; z-index:10001; font-family:'Fragment Mono',monospace; font-size:12px; color:#0a0a12; background:#b6ff2e; border-radius:20px; padding:8px 14px; box-shadow:0 6px 18px #000a; opacity:0; transform:translateY(10px); transition:opacity .25s ease, transform .25s ease; pointer-events:none; }
  #airToast.show { opacity:1; transform:none; }
  #airToast .c { display:inline-block; margin-left:6px; opacity:.7; }
`;
document.head.appendChild(style);

const bar = document.createElement('div');
bar.id = 'airbar';
bar.innerHTML = `<button id="airToggle"><span class="dot">● </span><span class="lbl"></span></button><button id="airGal" title="gallery">🖼</button>`;
document.body.appendChild(bar);
const $t = document.getElementById('airToggle');

let toastEl = null, toastT = null, saveCount = 0;
function toast(msg) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'airToast'; document.body.appendChild(toastEl); }
  toastEl.innerHTML = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

function refresh() {
  $t.className = consent === 'on' ? 'on' : 'off';
  if (consent === 'on' && recorder) $t.classList.add('rec');
  $t.querySelector('.lbl').textContent = consent === 'on' ? (recorder ? 'recording' : 'record: on') : 'record: off';
}
function setConsent(v) { consent = v; try { localStorage.setItem(LS, v); } catch (e) {}
  if (v === 'on') { armed = false; arm(); if (document.querySelector('canvas')) startCapture(); }
  else stopCapture(true);
  refresh();
}

// ---- capture ----
function arm() {
  if (armed || consent !== 'on') return; armed = true;
  const go = () => { window.removeEventListener('pointerdown', go, true); setTimeout(startCapture, 900); };
  window.addEventListener('pointerdown', go, true);   // start once the app starts (first gesture)
}
function startCapture() {
  if (recorder || consent !== 'on') return;
  const cv = document.querySelector('canvas'); if (!cv) { setTimeout(startCapture, 800); return; }
  try {
    // downscale a copy of the app canvas → small, well-compressed clips (cheap to stream)
    const RW = 426, sc = Math.min(1, RW / (cv.width || RW));
    const rc = document.createElement('canvas');
    rc.width = Math.max(2, Math.round((cv.width || RW) * sc));
    rc.height = Math.max(2, Math.round((cv.height || RW * 0.56) * sc));
    const rctx = rc.getContext('2d');
    let copying = true; stopCopy = () => { copying = false; };
    (function copy() { if (!copying) return; try { rctx.drawImage(cv, 0, 0, rc.width, rc.height); } catch (e) {} requestAnimationFrame(copy); })();
    const mixed = new MediaStream([...rc.captureStream(24).getVideoTracks(), ...audioTracks()]);
    chunks = []; done = false; sessionPath = null; posterDone = false;
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    recorder = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 600_000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = finish;
    recorder.start(1000);                              // 1s timeslice → chunks accumulate
    refresh();
    flushT = setInterval(flush, 15000);                // continuously save every 15s (no reliance on a clean close)
    capT = setTimeout(() => stopCapture(false), 120000);  // bound total session length
  } catch (e) { console.warn('capture failed', e); recorder = null; }
}
// re-upload the growing clip to one fixed filename — "streaming" without append complexity
async function flush() {
  if (consent !== 'on' || flushing || !chunks.length) return;
  flushing = true;
  try {
    if (!sessionPath) sessionPath = sessionName('webm');
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size < 20000) return;
    let poster = null;
    if (!posterDone) { const cv = document.querySelector('canvas'); poster = cv ? await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.7)) : null; }
    const first = !posterDone;
    await uploadTo(sessionPath, blob, poster);
    if (first) { posterDone = true; rememberMine(sessionPath); }
    saveCount++;
    toast(first ? '☁ Saved to the gallery — remove it anytime'
                : `☁ Session updated<span class="c">· save #${saveCount}</span>`);
  } catch (e) { console.warn('flush failed', e); } finally { flushing = false; }
}
function stopCapture(discard) {
  if (flushT) { clearInterval(flushT); flushT = null; }
  if (capT) { clearTimeout(capT); capT = null; }
  if (recorder && recorder.state !== 'inactive') { recorder.__discard = discard; recorder.stop(); }
}
async function finish() {
  if (done) return; done = true;
  const discard = recorder && recorder.__discard; recorder = null; if (stopCopy) { stopCopy(); stopCopy = null; } refresh();
  if (discard) { if (sessionPath) { forgetMine(sessionPath); deleteByName(sessionPath); } return; }   // toggled off → drop what streamed
  await flush();                                       // final save
}

// ---- gallery ----
async function openGallery() {
  let g = document.getElementById('airGallery');
  if (!g) { g = document.createElement('div'); g.id = 'airGallery'; g.innerHTML = `<div class="gw"><div class="gt"><span>AIRWAVES · sessions</span><button id="airGalX">✕ close</button></div><div class="gg" id="airGG"></div><div class="gm" id="airGM"></div></div>`; document.body.appendChild(g); g.querySelector('#airGalX').onclick = () => g.remove(); }
  const grid = g.querySelector('#airGG'), more = g.querySelector('#airGM'); grid.innerHTML = ''; more.textContent = 'loading…';
  try {
    const { items } = await listSessions(null, 30);
    more.textContent = items.length ? '' : 'no sessions yet';
    for (const s of items) {
      const el = document.createElement('div'); el.className = 'sc';
      el.innerHTML = `<video playsinline loop muted preload="none"></video><div class="m">${new Date(s.ts).toLocaleString()}</div>`;
      const v = el.querySelector('video'); getPosterUrl(s.name).then(u => { if (u) v.poster = u; });
      v.onclick = async () => { if (!v.src) { const u = await getUrl(s.item).catch(() => null); if (u) { v.src = u; v.muted = false; v.play().catch(() => {}); } } };
      if (isMine(s.path)) { const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '🗑 remove'; rm.onclick = async () => { rm.textContent = '…'; try { await deleteSession(s.item); forgetMine(s.path); el.remove(); } catch (e) { rm.textContent = 'failed'; } }; el.appendChild(rm); }
      grid.appendChild(el);
    }
  } catch (e) { console.error(e); more.textContent = 'gallery error: ' + (e.code || e.message); }
}

// ---- consent popup ----
function showConsent() {
  const m = document.createElement('div'); m.id = 'airConsent';
  m.innerHTML = `<div class="c"><h3>Record this session?</h3>
    <p>Your <b>camera + audio</b> will be saved to a <b>public gallery</b> so others can see it.
    You can <b>remove it any time</b>, and flip recording on/off with the button in the corner.</p>
    <div class="b"><button id="cOn">▸ Record</button><button id="cOff">Don't record</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector('#cOn').onclick = () => { setConsent('on'); m.remove(); };
  m.querySelector('#cOff').onclick = () => { setConsent('off'); m.remove(); };
}

$t.onclick = () => setConsent(consent === 'on' ? 'off' : 'on');
document.getElementById('airGal').onclick = openGallery;
window.addEventListener('visibilitychange', () => { if (document.hidden) stopCapture(false); });
window.addEventListener('pagehide', () => stopCapture(false));

if (consent === null) showConsent(); else { refresh(); if (consent === 'on') arm(); }
