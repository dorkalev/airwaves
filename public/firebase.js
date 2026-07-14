// AIRWAVES session recording — same architecture as the AIRSLICE wall, pointed
// at the shared AIRSLICE Firebase project and namespaced under demos/<DEMO>/.
// No database: sessions are named with an inverted-timestamp prefix so a
// lexicographic list() returns them newest-first. Ownership is tracked in
// localStorage (the real owner uid lives in file metadata for the rules).
export { FIREBASE_CONFIG, APPCHECK_SITE_KEY, ADMIN_EMAIL, DEMO } from './config.js';
import { FIREBASE_CONFIG, APPCHECK_SITE_KEY, DEMO } from './config.js';

const CDN = 'https://www.gstatic.com/firebasejs/10.12.2';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const MAXT = 1e13;   // 13-digit ms timestamps

let _fb = null;
export function getFirebase() {
  if (!_fb) _fb = (async () => {
    const [appMod, st, au, ac] = await Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-storage.js`),
      import(`${CDN}/firebase-auth.js`),
      APPCHECK_SITE_KEY ? import(`${CDN}/firebase-app-check.js`) : Promise.resolve(null),
    ]);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    // On localhost, print an App Check debug token to register (dev only).
    if (isLocal) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    if (ac && APPCHECK_SITE_KEY) {
      try { ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }); }
      catch (e) { console.warn('App Check init failed', e); }
    }
    const storage = st.getStorage(app), auth = au.getAuth(app);
    try { await auth.authStateReady(); } catch {}
    if (!auth.currentUser) { try { await au.signInAnonymously(auth); } catch (e) { console.warn('anon auth failed', e); } }
    return { st, au, storage, auth, get uid() { return auth.currentUser?.uid ?? null; } };
  })();
  return _fb;
}

const SESS = `demos/${DEMO}/sessions`, POST = `demos/${DEMO}/posters`;
const leafOf = (name) => name.split('/').pop();
const baseOf = (name) => leafOf(name).replace(/\.[^.]+$/, '');

// demos/<DEMO>/sessions/<invTs13>_<ts13>.<ext>  → list() returns newest-first
export function sessionName(ext) { const ts = Date.now(); return `${SESS}/${String(MAXT - ts).padStart(13,'0')}_${ts}.${ext}`; }
export function tsOf(name) { const m = leafOf(name).match(/^\d{13}_(\d{13})\./); return m ? +m[1] : 0; }

export async function uploadSession(blob, ext, posterBlob) {
  const { st, storage, uid } = await getFirebase();
  if (!uid) throw new Error('sign-in unavailable');
  const name = sessionName(ext);
  await st.uploadBytes(st.ref(storage, name), blob, {
    contentType: blob.type || 'video/webm',
    cacheControl: 'public, max-age=31536000, immutable',
    customMetadata: { owner: uid, demo: DEMO },
  });
  if (posterBlob) {
    try { await st.uploadBytes(st.ref(storage, `${POST}/${baseOf(name)}.jpg`), posterBlob, { contentType: 'image/jpeg', customMetadata: { owner: uid, demo: DEMO } }); } catch {}
  }
  return name;
}
export async function listSessions(pageToken = null, pageSize = 24) {
  const { st, storage } = await getFirebase();
  const res = await st.list(st.ref(storage, SESS), { maxResults: pageSize, pageToken });
  return { items: res.items.map(i => ({ item: i, name: i.name, path: i.fullPath, ts: tsOf(i.name) })), next: res.nextPageToken || null };
}
export async function getUrl(item) { const { st } = await getFirebase(); return st.getDownloadURL(item); }
export async function getPosterUrl(name) {
  const { st, storage } = await getFirebase();
  try { return await st.getDownloadURL(st.ref(storage, `${POST}/${baseOf(name)}.jpg`)); } catch { return null; }
}
export async function deleteSession(item) {
  const { st, storage } = await getFirebase();
  await st.deleteObject(item);
  try { await st.deleteObject(st.ref(storage, `${POST}/${baseOf(item.name)}.jpg`)); } catch {}
}

// ownership tracked locally (metadata.owner enforces it server-side)
const MK = 'airwaves-mysessions';
const readMine = () => { try { return JSON.parse(localStorage.getItem(MK) || '[]'); } catch { return []; } };
export function rememberMine(p) { try { localStorage.setItem(MK, JSON.stringify([...readMine(), p].slice(-200))); } catch {} }
export function forgetMine(p) { try { localStorage.setItem(MK, JSON.stringify(readMine().filter(x => x !== p))); } catch {} }
export function isMine(p) { return readMine().includes(p); }
