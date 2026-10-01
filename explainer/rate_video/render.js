// usage: node render.js preview t1 t2 ...   |   node render.js video out.mp4
// requires playwright (Chromium) and ffmpeg with libx264; set FFMPEG to override the binary path
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FPS = 30;

(async () => {
  const [mode, ...args] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.join(__dirname, 'scene.html'));
  await page.evaluate(() => window.ready);
  const total = await page.evaluate(() => window.TOTAL);
  const grab = async t => {
    const url = await page.evaluate(t => { window.render(t); return document.getElementById('c').toDataURL('image/png'); }, t);
    return Buffer.from(url.split(',')[1], 'base64');
  };

  if (mode === 'preview') {
    fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
    for (const t of args) fs.writeFileSync(path.join(__dirname, 'preview', `f_${t}.png`), await grab(parseFloat(t)));
  } else {
    const out = args[0];
    const ff = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out],
      { stdio: ['pipe', 'ignore', 'inherit'] });
    const n = Math.round(total * FPS);
    for (let i = 0; i < n; i++) {
      const buf = await grab(i / FPS);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 300 === 0) console.log(`frame ${i}/${n}`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log('done', total, 's');
  }
  await browser.close();
})();
