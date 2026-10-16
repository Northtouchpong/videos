import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
import { fetchFile } from 'https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js';

const $ = (id) => document.getElementById(id);
const input = $('file-input');
const dropzone = $('dropzone');
const ffmpeg = new FFmpeg();
let sourceFile = null;
let outputUrl = null;
let inputUrl = null;
let busy = false;
let cancelRequested = false;
let ffmpegReady = false;
let lastFfmpegLog = '';

const fmtBytes = (n) => {
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
const showError = (message) => { $('error-banner').textContent = message; $('error-banner').classList.remove('hidden'); };
const clearError = () => { $('error-banner').classList.add('hidden'); $('error-banner').textContent = ''; };

function setFile(file) {
  if (!file) return;
  clearError();
  if (!(file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg)$/i.test(file.name))) {
    showError('ไฟล์นี้ไม่ใช่วิดีโอที่รู้จัก กรุณาเลือกไฟล์วิดีโอ เช่น MP4, MOV, MKV หรือ WEBM'); return;
  }
  sourceFile = file;
  if (inputUrl) URL.revokeObjectURL(inputUrl);
  inputUrl = URL.createObjectURL(file);
  $('file-name').textContent = file.name;
  $('file-meta').textContent = `${fmtBytes(file.size)} · ${file.type || 'video'}`;
  $('file-card').classList.remove('hidden');
  $('preview-art').classList.add('hidden');
  const video = $('preview-video');
  video.src = inputUrl; video.classList.remove('hidden');
  $('preview-caption').textContent = file.name;
  video.onloadedmetadata = () => {
    const d = video.duration;
    $('duration-label').textContent = Number.isFinite(d) ? `${String(Math.floor(d / 60)).padStart(2,'0')}:${String(Math.floor(d % 60)).padStart(2,'0')}` : '—';
  };
  $('compress').disabled = false;
  $('button-label').textContent = 'บีบอัดวิดีโอ';
  $('result-card').classList.add('hidden');
  if (outputUrl) { URL.revokeObjectURL(outputUrl); outputUrl = null; }
}

input.addEventListener('change', () => { setFile(input.files?.[0]); input.value = ''; });
$('browse-file').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
dropzone.addEventListener('click', (e) => { if (e.target !== $('browse-file')) input.click(); });
$('remove-file').addEventListener('click', () => {
  sourceFile = null;
  $('file-card').classList.add('hidden');
  $('preview-video').pause(); $('preview-video').removeAttribute('src'); $('preview-video').load(); $('preview-video').classList.add('hidden');
  $('preview-art').classList.remove('hidden'); $('preview-caption').textContent = 'ตัวอย่างวิดีโอจะแสดงที่นี่'; $('duration-label').textContent = '00:00';
  $('compress').disabled = true; $('button-label').textContent = 'เลือกวิดีโอเพื่อเริ่ม';
  $('result-card').classList.add('hidden'); clearError();
  if (inputUrl) URL.revokeObjectURL(inputUrl); inputUrl = null;
});

for (const ev of ['dragenter','dragover']) dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragging'); });
for (const ev of ['dragleave','drop']) dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', e => setFile(e.dataTransfer?.files?.[0]));
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
// Prevent the browser from navigating to a video if it is dropped just outside the target.
window.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  if (!dropzone.contains(e.target)) setFile(e.dataTransfer.files[0]);
});

const qualityData = [
  { label: 'ไฟล์เล็ก', crf: '30', preset: 'fast', note: 'ขนาดเล็กที่สุด เหมาะกับคลิปสั้นหรือวิดีโอพื้นหลัง' },
  { label: 'สมดุล', crf: '26', preset: 'medium', note: 'แนะนำสำหรับวิดีโอเว็บไซต์ส่วนใหญ่' },
  { label: 'คุณภาพสูง', crf: '22', preset: 'medium', note: 'รักษารายละเอียดได้มากขึ้น โดยไฟล์อาจมีขนาดใหญ่กว่า' }
];
const quality = $('quality');
function syncQualityControl() {
  const idx = Number(quality.value);
  $('quality-label').textContent = qualityData[idx].label;
  $('quality-note').textContent = qualityData[idx].note;
  const pct = (idx / 2) * 100;
  quality.style.background = `linear-gradient(90deg,var(--lime) 0 ${pct}%,#3c4842 ${pct}%)`;
}
quality.addEventListener('input', () => {
  syncQualityControl();
});
quality.addEventListener('change', syncQualityControl);
syncQualityControl();

ffmpeg.on('progress', ({ progress, time }) => {
  if (!busy || !Number.isFinite(progress)) return;
  const pct = Math.min(98, Math.max(1, Math.round(progress * 100)));
  $('progress-bar').style.width = `${pct}%`;
  $('progress-percent').textContent = `${pct}%`;
  if (time > 0) $('progress-detail').textContent = `กำลังเข้ารหัส · ${Math.round(time / 1000000)} วินาที`;
});
ffmpeg.on('log', ({ message }) => {
  if (message) lastFfmpegLog = message;
  if (message?.includes('frame=') && busy) $('progress-status').textContent = 'กำลังบีบอัดวิดีโอ…';
});

async function ensureEngine() {
  if (ffmpegReady) return;
  $('progress-status').textContent = 'กำลังดาวน์โหลดตัวเข้ารหัสครั้งแรก…';
  const packageBase = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm';
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
  let workerBlobUrl;
  try {
    // FFmpeg's module worker is normally resolved beside the CDN-hosted library.
    // Fetch its entry source, rewrite relative imports to the same CDN, and launch
    // a blob worker so cross-origin worker restrictions do not block the app.
    const workerResponse = await fetch(`${packageBase}/worker.js`);
    if (!workerResponse.ok) throw new Error(`โหลด worker ไม่สำเร็จ (${workerResponse.status})`);
    let workerSource = await workerResponse.text();
    workerSource = workerSource.replace(/(['"])(\.\/[A-Za-z0-9._-]+\.js)\1/g, (_match, quote, path) => `${quote}${packageBase}/${path.slice(2)}${quote}`);
    workerBlobUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
    await ffmpeg.load({
      classWorkerURL: workerBlobUrl,
      // Keep core and WASM on their CDN URLs: importing a core script through a
      // blob URL from inside a module worker fails in some browsers.
      coreURL: `${base}/ffmpeg-core.js`,
      wasmURL: `${base}/ffmpeg-core.wasm`
    });
    ffmpegReady = true;
  } finally {
    if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl);
  }
}

$('compress').addEventListener('click', async () => {
  if (!sourceFile || busy) return;
  clearError(); busy = true; cancelRequested = false;
  lastFfmpegLog = '';
  $('compress').disabled = true; $('button-label').textContent = 'กำลังบีบอัด…';
  $('progress-panel').classList.remove('hidden'); $('progress-bar').style.width = '0%'; $('progress-percent').textContent = '0%';
  $('progress-status').textContent = 'กำลังเตรียมตัวเข้ารหัส…'; $('progress-detail').textContent = 'ครั้งแรกอาจใช้เวลาสักครู่เพื่อโหลดตัวเข้ารหัส';
  try {
    await ensureEngine();
    if (cancelRequested) return;
    $('progress-status').textContent = 'กำลังอ่านไฟล์วิดีโอ…';
    // ffmpeg.wasm currently keeps input and output in browser memory; large files need ample free RAM.
    await ffmpeg.writeFile('input-video', await fetchFile(sourceFile));
    if (cancelRequested) return;
    const q = qualityData[Number(quality.value)];
    const args = ['-i','input-video','-map','0:v:0','-map','0:a?'];
    if ($('resize').checked) args.push('-vf','scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2');
    args.push('-c:v','libx264','-preset',q.preset,'-crf',q.crf,'-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-metadata','comment=Compressed locally with Frame','output.mp4');
    $('progress-status').textContent = 'กำลังบีบอัดวิดีโอ…';
    const exitCode = await ffmpeg.exec(args);
    if (cancelRequested) return;
    if (exitCode !== 0) throw new Error(`FFmpeg หยุดทำงาน (รหัส ${exitCode})${lastFfmpegLog ? `: ${lastFfmpegLog}` : ''}`);
    const data = await ffmpeg.readFile('output.mp4');
    if (!data?.length) throw new Error('ไฟล์ผลลัพธ์ว่างเปล่า');
    const blob = new Blob([data], { type: 'video/mp4' });
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    outputUrl = URL.createObjectURL(blob);
    $('download').href = outputUrl;
    const baseName = sourceFile.name.replace(/\.[^.]+$/, '') || 'video';
    $('download').download = `${baseName}-compressed.mp4`;
    $('before-size').textContent = fmtBytes(sourceFile.size); $('after-size').textContent = fmtBytes(blob.size);
    const saving = sourceFile.size ? Math.max(0, Math.round((1 - blob.size / sourceFile.size) * 100)) : 0;
    $('saving-text').textContent = saving > 0 ? `ลดลง ${saving}%` : 'ไฟล์มีขนาดใกล้เคียงเดิม';
    $('saving-bar').style.width = `${saving}%`;
    $('result-card').classList.remove('hidden');
    $('progress-bar').style.width = '100%'; $('progress-percent').textContent = '100%'; $('progress-status').textContent = 'เสร็จแล้ว'; $('progress-detail').textContent = 'บันทึกไฟล์ลงอุปกรณ์ได้ด้วยปุ่มดาวน์โหลด';
    await ffmpeg.deleteFile('input-video').catch(() => {}); await ffmpeg.deleteFile('output.mp4').catch(() => {});
  } catch (err) {
    console.error(err);
    if (!cancelRequested) {
      const message = String(err?.message || err);
      if (/memory|OOM|allocate|out of memory|cannot enlarge/i.test(message)) {
        showError('หน่วยความจำของเบราว์เซอร์ไม่พอสำหรับไฟล์นี้ ลองปิดแท็บอื่น ใช้ไฟล์เล็กลง หรือลดความละเอียดก่อนบีบอัด');
      } else if (/worker|cross-origin|securityerror|script at|failed to construct/i.test(message)) {
        showError('เบราว์เซอร์บล็อก worker ของตัวเข้ารหัส ลองเปิดเว็บด้วย Chrome หรือ Edge เวอร์ชันล่าสุด และตรวจว่าเชื่อมต่ออินเทอร์เน็ตได้');
      } else if (/fetch|network|load|http|wasm|failed to|โหลด worker/i.test(message)) {
        showError(`โหลดตัวเข้ารหัสไม่สำเร็จ: ${message.slice(0, 220)} กรุณาตรวจการเชื่อมต่ออินเทอร์เน็ตหรือ CDN แล้วลองอีกครั้ง`);
      } else {
        showError(`บีบอัดไม่สำเร็จ: ${message.slice(0, 260)}${lastFfmpegLog && !message.includes(lastFfmpegLog) ? ` · ${lastFfmpegLog.slice(0, 140)}` : ''}`);
      }
    }
  } finally {
    busy = false; $('compress').disabled = !sourceFile; $('button-label').textContent = sourceFile ? 'บีบอัดอีกครั้ง' : 'เลือกวิดีโอเพื่อเริ่ม';
    $('cancel').textContent = 'ปิด';
  }
});

$('cancel').addEventListener('click', async () => {
  if (!busy) { $('progress-panel').classList.add('hidden'); return; }
  cancelRequested = true; $('progress-status').textContent = 'กำลังหยุดงาน…'; $('cancel').disabled = true;
  try { await ffmpeg.terminate(); } catch {}
  ffmpegReady = false;
  $('progress-status').textContent = 'ยกเลิกแล้ว'; $('progress-detail').textContent = 'สามารถเริ่มบีบอัดใหม่ได้';
  $('cancel').disabled = false; $('cancel').textContent = 'ปิด';
  busy = false; $('compress').disabled = !sourceFile; $('button-label').textContent = sourceFile ? 'บีบอัดวิดีโอ' : 'เลือกวิดีโอเพื่อเริ่ม';
});

window.addEventListener('beforeunload', () => {
  if (inputUrl) URL.revokeObjectURL(inputUrl);
  if (outputUrl) URL.revokeObjectURL(outputUrl);
});
