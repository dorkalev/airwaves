// Google Analytics (GA4) for every AIRWAVES page — one place for the whole
// site. (Named plainly, not "analytics.js", so ad-blockers don't neuter it.)
// Only runs on this project's own domains, so a fork never reports to this
// property; a forker sets their own GA_ID + host below, or leaves it off.
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
