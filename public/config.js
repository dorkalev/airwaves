// Shared backend: all AIR demos record into the AIRSLICE Firebase project.
// These are client-side identifiers (safe to ship) — real protection is the
// Storage rules + App Check, not hiding these values.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAetL9_LGXJJf0u70hbcpoxaOK3p9KgsRw',
  authDomain: 'airslice-5b3e3.firebaseapp.com',
  projectId: 'airslice-5b3e3',
  storageBucket: 'airslice-5b3e3.firebasestorage.app',
  appId: '1:154550220274:web:80949d7333d213ede4e76b',
};
export const APPCHECK_SITE_KEY = '6Leph08tAAAAAAiMIC2TB930zt99EaMjXBzidX6c';   // reCAPTCHA v3
export const ADMIN_EMAIL = 'dor@dorkalev.com';   // only this (verified) account can moderate
export const DEMO = 'airwaves';                   // namespaces this demo's sessions in the shared bucket
