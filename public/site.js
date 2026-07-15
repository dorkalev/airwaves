// Site-wide bootstrap on every AIRWAVES page (named plainly, not
// "analytics.js", so ad-blockers don't neuter it). Runs first thing.

// Canonical domain: send any other host (the *.web.app default) to the custom
// domain, preserving the route. Blank CANON disables it (e.g. forks).
const CANON = 'airwaves.dorkalev.com';
if (CANON && !['localhost', '127.0.0.1', CANON].includes(location.hostname)) {
  location.replace('https://' + CANON + location.pathname + location.search + location.hash);
}

// Google Analytics (GA4) — one place for the whole site. Only on this
// project's own domains, so a fork never reports to this property.
const GA_ID = 'G-N410M0RDYH';   // AIRWAVES GA4 property
const OWN = /(^|\.)dorkalev\.com$|(^|\.)airwaves-dorkalev\.web\.app$/.test(location.hostname);

if (GA_ID && OWN && !/X{4,}/.test(GA_ID)) {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GA_ID);
}
