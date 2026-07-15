// Shared recording layer for every AIRWAVES version.
//  - consent popup on first load (choice remembered); a persistent toggle to flip it
//  - auto-captures the page's canvas + audio and uploads to the shared gallery
//  - a 🖼 gallery button (remove-your-own)
// Audio is captured generically by tapping every AudioContext's connection to
// its destination — so it works on any version without editing the app.
import { sessionName, uploadTo, deleteByName, listSessions, getUrl, getPosterUrl, deleteSession, rememberMine, forgetMine, isMine, RECORDING_ENABLED } from './firebase.js?v=2';

// No Firebase project configured (e.g. a fork with a blank config.js) → this
// whole layer stays out of the way: no capture, no UI, no network, no clutter.
if (RECORDING_ENABLED) {

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
// which build this clip is from: /v14 (or /v14.html) → 'v14'; anything else → 'live'
const REC_VER = (location.pathname.match(/\/(v\d+)(?:\.html?)?$/i) || [])[1] || 'live';
let consent = localStorage.getItem(LS);   // 'on' | 'off' | null
let recorder = null, chunks = [], done = false, capT = null;
let sessionPath = null, posterDone = false, flushT = null, flushing = false, stopCopy = null;

// ---- UI ----
const style = document.createElement('style');
style.textContent = `
  #airbar { position:fixed; left:12px; bottom:12px; z-index:9999; display:flex; gap:8px; font-family:'Fragment Mono',monospace; }
  #airbar button { cursor:pointer; font-size:12px; border-radius:20px; padding:7px 12px; border:1px solid #ffffff22; background:#12121ecc; color:#cfe; backdrop-filter:blur(4px); }
  #airToggle.on { color:#ff8aa8; border-color:#ff2e8855; } #airToggle.off { color:#8a94a5; }
  #airStop { display:none; color:#0a0a12; background:#b6ff2e; border-color:#b6ff2e; font-weight:bold; }
  #airSkip { display:inline-block; margin:12px 0 0 14px; background:transparent; border:none; color:#8a94a5; font-size:13px; cursor:pointer; text-decoration:underline; text-underline-offset:3px; font-family:'Fragment Mono',monospace; opacity:.7; vertical-align:middle; }
  #airSkip:hover { color:#cfe; opacity:1; }
  #airCount { position:fixed; inset:0; z-index:9998; display:grid; place-items:center; pointer-events:none; }
  #airCount .msg { font-family:'Bangers','Arial Black',sans-serif; font-size:clamp(40px,9vw,76px); color:#fff; text-align:center; letter-spacing:.03em; padding:0 24px; text-shadow:0 4px 0 #ff2e88, 0 0 30px #000c; }
  #airCount .msg.pop { animation:airpop .38s cubic-bezier(.2,1.4,.4,1); }
  @keyframes airpop { from { transform:scale(.55); opacity:0; } to { transform:scale(1); opacity:1; } }
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
  #airToast.err { background:#ff2e88; color:#fff; }
  #airToast .c { display:inline-block; margin-left:6px; opacity:.7; }
  #airGallery .sc .sv { position:relative; }
  #airGallery .sc video { filter:brightness(.88); transition:filter .25s ease; }
  #airGallery .sc video.live { filter:none; }
  #airGallery .sc .mx { position:absolute; bottom:8px; right:8px; font-size:11px; color:#cfe; background:#000000cc; border:1px solid #ffffff33; border-radius:6px; padding:2px 7px; cursor:pointer; }
  #airGallery .sc .mx:hover { border-color:#29f4ff; color:#fff; }
  #airGallery .sc .vb { position:absolute; top:8px; left:8px; font-size:10px; font-weight:bold; color:#0a0a12; background:#b6ff2e; border-radius:6px; padding:2px 6px; font-family:'Fragment Mono',monospace; }
  #airLight { position:fixed; inset:0; z-index:10002; display:none; place-items:center; background:#0a0a12ee; backdrop-filter:blur(8px); padding:24px; }
  #airLight.show { display:grid; }
  #airLight .lb { position:relative; }
  #airLight video { max-width:90vw; max-height:86vh; border-radius:12px; background:#000; box-shadow:0 20px 60px #000c; display:block; }
  #airLight .lx { position:absolute; top:-15px; right:-15px; width:36px; height:36px; border-radius:50%; border:none; background:#ff2e88; color:#fff; font-size:16px; cursor:pointer; box-shadow:0 4px 14px #000a; }
  #airConfirm { position:fixed; inset:0; z-index:10003; display:none; place-items:center; background:#0a0a12dd; backdrop-filter:blur(6px); padding:24px; font-family:'Fragment Mono',monospace; }
  #airConfirm.show { display:grid; }
  #airConfirm .cf { background:#12121e; border:1px solid #ffffff1c; border-radius:16px; padding:26px; max-width:340px; text-align:center; color:#e8ebf0; }
  #airConfirm p { font-size:14px; color:#fff; line-height:1.5; } #airConfirm p span { display:block; color:#889; font-size:12px; margin-top:7px; }
  #airConfirm .b { display:flex; gap:10px; justify-content:center; margin-top:20px; }
  #airConfirm button { cursor:pointer; font-family:'Fragment Mono',monospace; font-size:13px; border-radius:9px; padding:9px 18px; border:1px solid #ffffff22; background:transparent; color:#cfe; }
  #airConfirm .yes { background:#ff2e88; border:none; color:#fff; font-weight:bold; }
`;
document.head.appendChild(style);

const bar = document.createElement('div');
bar.id = 'airbar';
bar.innerHTML = `<button id="airToggle"><span class="dot">● </span><span class="lbl"></span></button><button id="airStop" title="stop & save this take">◼ finish</button><button id="airGal" title="gallery">🖼</button>`;
document.body.appendChild(bar);
const $t = document.getElementById('airToggle');
const $stop = document.getElementById('airStop');

let toastEl = null, toastT = null, saveCount = 0;
function toast(msg, err) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.id = 'airToast'; document.body.appendChild(toastEl); }
  toastEl.innerHTML = msg; toastEl.classList.toggle('err', !!err); toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), err ? 4000 : 2400);
}

function refresh() {
  $t.className = consent === 'on' ? 'on' : 'off';
  if (consent === 'on' && recorder) $t.classList.add('rec');
  $t.querySelector('.lbl').textContent = consent === 'on' ? (recorder ? 'recording' : 'record: on') : 'record: off';
  $stop.style.display = recorder ? 'inline-block' : 'none';   // only offer "finish" while a take is running
}
// stop the running take and keep it (final flush). To record again, toggle
// recording on in the corner, or re-open the version.
function finishTake() {
  if (!recorder) return;
  stopCapture(false);
}
window.airRecorder = { finish: finishTake, isRecording: () => !!recorder };
function setConsent(v) { consent = v; try { localStorage.setItem(LS, v); } catch (e) {}
  if (v === 'on') startCapture();   // begins as soon as a canvas is up (startCapture self-retries)
  else stopCapture(true);
  refresh();
}

// ---- capture ----
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
    flushT = setInterval(flush, 5000);                 // continuously save every 5s (no reliance on a clean close)
    capT = setTimeout(() => stopCapture(false), 120000);  // bound total session length
  } catch (e) { console.warn('capture failed', e); recorder = null; }
}
// re-upload the growing clip to one fixed filename — "streaming" without append complexity
async function flush() {
  if (consent !== 'on' || flushing || !chunks.length) return;
  flushing = true;
  try {
    if (!sessionPath) sessionPath = sessionName('webm', REC_VER);
    const blob = new Blob(chunks, { type: 'video/webm' });
    if (blob.size < 8000) return;
    let poster = null;
    if (!posterDone) { const cv = document.querySelector('canvas'); poster = cv ? await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.7)) : null; }
    const first = !posterDone;
    await uploadTo(sessionPath, blob, poster);
    if (first) { posterDone = true; rememberMine(sessionPath); }
    saveCount++;
    toast(first ? '☁ Saved to the gallery — remove it anytime'
                : `☁ Session updated<span class="c">· save #${saveCount}</span>`);
  } catch (e) { console.warn('flush failed', e); toast('⚠ Couldn\'t save — check your connection', true); }
  finally { flushing = false; }
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

// ---- enlarge lightbox + delete confirm (shared by the overlay gallery) ----
function airLight(urlP) {
  let m = document.getElementById('airLight');
  if (!m) { m = document.createElement('div'); m.id = 'airLight';
    m.innerHTML = `<div class="lb"><button class="lx">✕</button><video controls playsinline></video></div>`;
    document.body.appendChild(m);
    const close = () => { const v = m.querySelector('video'); v.pause(); v.removeAttribute('src'); v.load(); m.classList.remove('show'); };
    m.onclick = e => { if (e.target === m) close(); }; m.querySelector('.lx').onclick = close;
  }
  const v = m.querySelector('video'); v.removeAttribute('src'); m.classList.add('show');
  urlP.then(u => { if (u) { v.src = u; v.play().catch(() => {}); } });
}
function airConfirm(onYes) {
  let m = document.getElementById('airConfirm');
  if (!m) { m = document.createElement('div'); m.id = 'airConfirm';
    m.innerHTML = `<div class="cf"><p>Delete this clip?<span>It’s removed from the gallery for everyone — can’t be undone.</span></p><div class="b"><button class="no">Cancel</button><button class="yes">Delete</button></div></div>`;
    document.body.appendChild(m); m.onclick = e => { if (e.target === m) m.classList.remove('show'); };
  }
  m.classList.add('show');
  m.querySelector('.no').onclick = () => m.classList.remove('show');
  m.querySelector('.yes').onclick = () => { m.classList.remove('show'); onYes(); };
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
      el.innerHTML = `<div class="sv"><video playsinline loop muted preload="none"></video><span class="vb">${s.version || '?'}</span><button class="mx" title="enlarge">⛶</button></div><div class="m">${new Date(s.ts).toLocaleString()}</div>`;
      const v = el.querySelector('video'); getPosterUrl(s.name).then(u => { if (u) v.poster = u; });
      v.addEventListener('play', () => { v.classList.add('live'); grid.querySelectorAll('video').forEach(o => { if (o !== v) o.pause(); }); });   // only one plays
      v.addEventListener('pause', () => { v.classList.remove('live'); try { v.currentTime = 0; } catch (e) {} });                                  // dim back to the start
      v.onclick = async () => { if (!v.src) { const u = await getUrl(s.item).catch(() => null); if (u) { v.src = u; v.muted = false; v.play().catch(() => {}); } } else if (v.paused) { v.play().catch(() => {}); } else { v.pause(); } };
      el.querySelector('.mx').onclick = () => airLight(getUrl(s.item).catch(() => null));
      if (isMine(s.path)) { const rm = document.createElement('button'); rm.className = 'rm'; rm.textContent = '🗑 remove'; rm.onclick = () => airConfirm(async () => { rm.textContent = '…'; try { await deleteSession(s.item); forgetMine(s.path); el.remove(); } catch (e) { rm.textContent = 'failed'; } }); el.appendChild(rm); }
      grid.appendChild(el);
    }
  } catch (e) { console.error(e); more.textContent = 'gallery error: ' + (e.code || e.message); }
}

// ---- consent popup (fallback for apps with no START button) ----
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

// ---- fold the recording choice into the game's START button ----
// primary "Start + record" opts in; a quiet "skip recording" beside it opts out.
// The game starts immediately; a ready-countdown plays, then (if recording)
// capture begins — so it never records the fumbling before you're set.
let skipping = false;
function countdown(record) {
  const o = document.createElement('div'); o.id = 'airCount';
  o.innerHTML = `<div class="msg"></div>`; document.body.appendChild(o);
  const msg = o.querySelector('.msg');
  const steps = record ? ['Use your hands to play!', '3', '2', '1', 'record starts!'] : ['starting!'];
  const holds = record ? [1200, 800, 800, 800, 900] : [1100];
  let i = 0;
  (function tick() {
    if (i >= steps.length) { o.remove(); if (record) startCapture(); return; }
    msg.textContent = steps[i];
    msg.classList.remove('pop'); void msg.offsetWidth; msg.classList.add('pop');
    const h = holds[i]; i++; setTimeout(tick, h);
  })();
}
function beginSequence(record) {
  consent = record ? 'on' : 'off';
  try { localStorage.setItem(LS, consent); } catch (e) {}
  refresh();
  countdown(record);   // recording (if any) starts only when the countdown ends
}
function integrateStart() {
  const btn = document.getElementById('start');
  if (!btn) return false;
  if (!btn.__air) {
    btn.__air = true;
    btn.textContent = 'START + RECORD ▸';
    const skip = document.createElement('button');
    skip.id = 'airSkip'; skip.type = 'button'; skip.textContent = 'skip recording';
    btn.insertAdjacentElement('afterend', skip);
    // capture phase → run the ready-sequence BEFORE the app's own start handler
    btn.addEventListener('click', () => { if (!btn.__started) { btn.__started = true; beginSequence(!skipping); } }, true);
    skip.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); skipping = true; btn.click(); }, false);
  }
  return true;
}

$t.onclick = () => setConsent(consent === 'on' ? 'off' : 'on');
$stop.onclick = () => { finishTake(); toast('◼ Take finished — saved to the gallery'); };
document.getElementById('airGal').onclick = openGallery;
window.addEventListener('visibilitychange', () => { if (document.hidden) stopCapture(false); });
window.addEventListener('pagehide', () => stopCapture(false));

refresh();
if (integrateStart()) { /* START carries the choice → capture begins on that click; no separate popup */ }
else if (consent === null) showConsent();
else if (consent === 'on') startCapture();

} // end if (RECORDING_ENABLED)
