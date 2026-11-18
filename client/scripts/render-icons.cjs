// Renders Orbit's PNG icons and OG image from the SVG logo.
// Usage (from client/): node scripts/render-icons.cjs. Needs network for the
// Sora and Inter fonts in the OG image. The output is committed in public/.
const path = require('path');
const clientDir = path.resolve(__dirname, '..');
const { chromium } = require(path.join(clientDir, 'node_modules/playwright'));
const out = (f) => path.join(clientDir, 'public', f);

const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7ff6"/><stop offset="1" stop-color="#6d5cf0"/></linearGradient></defs>`;
const mark = `<ellipse cx="32" cy="33" rx="26" ry="10" fill="none" stroke="url(#g)" stroke-width="4" transform="rotate(-22 32 33)"/><circle cx="32" cy="33" r="14" fill="url(#g)"/><circle cx="27" cy="28" r="4.5" fill="#ffffff" opacity="0.35"/>`;

// Rounded tile, transparent corners: the "any" icon, same as orbit-icon.svg.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}<rect width="64" height="64" rx="14" fill="#0e0b1f"/>${mark}</svg>`;
// Full-bleed square with the mark scaled into the centre: the platform applies
// its own mask (maskable: safe zone is the centre circle of radius 40%).
const square = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${defs}<rect width="64" height="64" fill="#0e0b1f"/><g transform="translate(32 32) scale(${scale}) translate(-32 -33)">${mark}</g></svg>`;
// Monochrome silhouette for the notification badge (Android uses alpha only).
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><g transform="translate(32 32) scale(1.15) translate(-32 -33)"><ellipse cx="32" cy="33" rx="26" ry="10" fill="none" stroke="#fff" stroke-width="5" transform="rotate(-22 32 33)"/><circle cx="32" cy="33" r="14" fill="#fff"/></g></svg>`;

const svgPage = (svg, size) => `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;

const og = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@500&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:1200px;height:630px}
  body{background:#08060f;color:#f4f2ff;font-family:Inter,system-ui,sans-serif;position:relative;overflow:hidden}
  .glow{position:absolute;width:900px;height:900px;border-radius:50%;right:-320px;top:-260px;background:radial-gradient(circle,rgba(109,92,240,.38),rgba(109,92,240,0) 62%)}
  .glow2{position:absolute;width:700px;height:700px;border-radius:50%;left:-300px;bottom:-420px;background:radial-gradient(circle,rgba(139,127,246,.18),rgba(139,127,246,0) 60%)}
  .stars{position:absolute;inset:0;background-image:radial-gradient(1.4px 1.4px at 12% 18%,#fff8,transparent),radial-gradient(1px 1px at 28% 72%,#fff6,transparent),radial-gradient(1.2px 1.2px at 46% 30%,#fff5,transparent),radial-gradient(1px 1px at 63% 84%,#fff6,transparent),radial-gradient(1.5px 1.5px at 78% 14%,#fff7,transparent),radial-gradient(1px 1px at 90% 58%,#fff5,transparent),radial-gradient(1.2px 1.2px at 8% 88%,#fff5,transparent),radial-gradient(1px 1px at 38% 8%,#fff5,transparent)}
  .content{position:absolute;left:88px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;width:680px}
  .brand{display:flex;align-items:center;gap:22px}
  .brand span{font-family:Sora,sans-serif;font-weight:800;font-size:64px;letter-spacing:-1.5px}
  h1{font-family:Sora,sans-serif;font-weight:700;font-size:58px;line-height:1.05;letter-spacing:-1.5px;margin:44px 0 0}
  p{font-size:26px;color:#b9b3d9;margin:24px 0 0;line-height:1.4}
  .big{position:absolute;right:70px;top:115px}
</style></head><body>
<div class="glow"></div><div class="glow2"></div><div class="stars"></div>
<div class="content">
  <div class="brand">${tile.replace('<svg ', '<svg width="84" height="84" ')}<span>Orbit</span></div>
  <h1>The finance hub built for student life.</h1>
  <p>Budgets, bills, tuition and reports in one place.</p>
</div>
<div class="big"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="400" height="400">${defs}${mark}</svg></div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const shot = async (html, w, h, file, transparent) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out(file), omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
    await page.close();
    console.log('wrote', file);
  };
  await shot(svgPage(tile, 192), 192, 192, 'icon-192.png', true);
  await shot(svgPage(tile, 512), 512, 512, 'icon-512.png', true);
  await shot(svgPage(square(0.72), 512), 512, 512, 'icon-maskable-512.png', false);
  await shot(svgPage(square(0.86), 180), 180, 180, 'apple-touch-icon.png', false);
  await shot(svgPage(badge, 96), 96, 96, 'badge-96.png', true);
  await shot(og, 1200, 630, 'og-image.png', false);
  await browser.close();
})();
