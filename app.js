import { FFmpeg } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.10/dist/esm/index.js';
const $ = (id) => document.getElementById(id);
const input = $('file-input');
const dropzone = $('dropzone');
const ffmpeg = new FFmpeg();
const queue = [];
let previewUrl = null;
let busy = false;
let cancelRequested = false;
let ffmpegReady = false;
let lastFfmpegLog = '';
let currentItem = null;
let batchIndex = 0;
let batchTotal = 0;

const fmtBytes = (n) => {
  if (!Number.isFinite(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
const showError = (message) => { $('error-banner').textContent = message; $('error-banner').classList.remove('hidden'); };
const clearError = () => { $('error-banner').classList.add('hidden'); $('error-banner').textContent = ''; };

function setPreview(file) {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $('file-name').textContent = file.name;
  $('file-meta').textContent = `${fmtBytes(file.size)} · ${file.type || 'video'}`;
  $('preview-art').classList.add('hidden');
  const video = $('preview-video');
  video.src = previewUrl; video.classList.remove('hidden');
  $('preview-caption').textContent = file.name;
  video.onloadedmetadata = () => {
    const d = video.duration;
    $('duration-label').textContent = Number.isFinite(d) ? `${String(Math.floor(d / 60)).padStart(2,'0')}:${String(Math.floor(d % 60)).padStart(2,'0')}` : '—';
  };
}

function renderQueue() {
  $('file-card').classList.toggle('hidden', queue.length === 0);
  $('queue-list').classList.toggle('hidden', queue.length === 0);
  $('file-name').textContent = `${queue.length} วิดีโอในคิว`;
  const total = queue.reduce((sum, item) => sum + item.file.size, 0);
  $('file-meta').textContent = `${fmtBytes(total)} รวม · ทำงานทีละไฟล์`;
  $('queue-list').replaceChildren(...queue.map(item => {
    const row = document.createElement('div'); row.className = 'queue-item';
    const name = document.createElement('span'); name.className = 'queue-item-name'; name.textContent = item.file.name;
    const size = document.createElement('span'); size.className = 'queue-item-size'; size.textContent = fmtBytes(item.file.size);
    const status = document.createElement('span'); status.className = `queue-item-status${item.status === 'เสร็จแล้ว' ? ' done' : item.status === 'ผิดพลาด' ? ' error' : ''}`; status.textContent = item.status;
    row.append(name, size, status); return row;
  }));
  const pending = queue.filter(item => item.status === 'รอคิว').length;
  $('compress').disabled = busy || pending === 0;
  $('button-label').textContent = busy ? 'กำลังบีบอัด…' : pending ? `บีบอัด ${pending} ไฟล์` : 'เลือกวิดีโอเพื่อเริ่ม';
}

function addFiles(files) {
  clearError();
  const accepted = [];
  for (const file of files) {
    if (!(file.type.startsWith('video/') || /\.(mp4|mov|mkv|webm|avi|m4v|mpeg|mpg)$/i.test(file.name))) {
      showError(`ข้ามไฟล์ “${file.name}” เพราะไม่ใช่รูปแบบวิดีโอที่รองรับ`); continue;
    }
    const duplicate = queue.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
    if (duplicate) continue;
    const item = { id: `${Date.now()}-${Math.random()}`, file, status: 'รอคิว', outputUrl: null };
    queue.push(item); accepted.push(item);
  }
  if (accepted.length) setPreview(accepted[0].file);
  if (queue.some(item => item.outputUrl)) $('result-card').classList.remove('hidden');
  renderQueue();
}

input.addEventListener('change', () => { addFiles(Array.from(input.files || [])); input.value = ''; });
$('browse-file').addEventListener('click', (e) => { e.stopPropagation(); input.click(); });
dropzone.addEventListener('click', (e) => { if (e.target !== $('browse-file')) input.click(); });
$('remove-file').addEventListener('click', () => {
  if (busy) return;
  queue.forEach(item => { if (item.outputUrl) URL.revokeObjectURL(item.outputUrl); });
  queue.length = 0;
  $('preview-video').pause(); $('preview-video').removeAttribute('src'); $('preview-video').load(); $('preview-video').classList.add('hidden');
  $('preview-art').classList.remove('hidden'); $('preview-caption').textContent = 'ตัวอย่างวิดีโอจะแสดงที่นี่'; $('duration-label').textContent = '00:00';
  $('result-card').classList.add('hidden'); $('results-list').replaceChildren(); clearError(); renderQueue();
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null;
});

for (const ev of ['dragenter','dragover']) dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.add('dragging'); });
for (const ev of ['dragleave','drop']) dropzone.addEventListener(ev, e => { e.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', e => addFiles(Array.from(e.dataTransfer?.files || [])));
dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
// Prevent the browser from navigating to a video if it is dropped just outside the target.
window.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
window.addEventListener('drop', e => {
  if (!e.dataTransfer?.files?.length) return;
  e.preventDefault();
  if (!dropzone.contains(e.target)) addFiles(Array.from(e.dataTransfer.files));
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
  if (!busy || !Number.isFinite(progress) || !currentItem) return;
  const total = Math.max(1, batchTotal);
  const pct = Math.min(99, Math.max(1, Math.round(((batchIndex + progress) / total) * 100)));
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
  // This is imported by ffmpeg.wasm's module worker, so use the ESM core build.
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
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

function addResult(item) {
  const row = document.createElement('div'); row.className = 'result-item';
  const info = document.createElement('div'); info.className = 'result-item-info';
  const name = document.createElement('strong'); name.textContent = item.file.name;
  const saving = item.file.size ? Math.max(0, Math.round((1 - item.outputSize / item.file.size) * 100)) : 0;
  const details = document.createElement('span'); details.textContent = `${fmtBytes(item.file.size)} → ${fmtBytes(item.outputSize)} · ${saving > 0 ? `ลด ${saving}%` : 'ขนาดใกล้เคียงเดิม'}`;
  const link = document.createElement('a'); link.href = item.outputUrl; link.download = `${item.file.name.replace(/\.[^.]+$/, '') || 'video'}-compressed.mp4`; link.setAttribute('aria-label', `ดาวน์โหลด ${name.textContent}`);
  link.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 18v2h14v-2"/></svg>';
  info.append(name, details); row.append(info, link); $('results-list').append(row);
}

function showCompressionError(err) {
  const message = String(err?.message || err);
  if (/memory|OOM|allocate|out of memory|cannot enlarge/i.test(message)) {
    return 'หน่วยความจำของเบราว์เซอร์ไม่พอ ลองปิดแท็บอื่น ใช้ไฟล์เล็กลง หรือลดความละเอียดก่อนบีบอัด';
  }
  if (/worker|cross-origin|securityerror|script at|failed to construct/i.test(message)) {
    return 'เบราว์เซอร์บล็อก worker ของตัวเข้ารหัส ลอง Chrome หรือ Edge เวอร์ชันล่าสุด และตรวจการเชื่อมต่ออินเทอร์เน็ต';
  }
  if (/fetch|network|load|http|wasm|failed to|โหลด worker/i.test(message)) {
    return `โหลดตัวเข้ารหัสไม่สำเร็จ: ${message.slice(0, 180)} ตรวจอินเทอร์เน็ตหรือ CDN แล้วลองอีกครั้ง`;
  }
  return `บีบอัดไม่สำเร็จ: ${message.slice(0, 200)}${lastFfmpegLog && !message.includes(lastFfmpegLog) ? ` · ${lastFfmpegLog.slice(0, 120)}` : ''}`;
}

$('compress').addEventListener('click', async () => {
  if (busy) return;
  const pending = queue.filter(item => item.status === 'รอคิว');
  if (!pending.length) return;
  clearError(); busy = true; cancelRequested = false;
  batchTotal = pending.length;
  $('compress').disabled = true; $('button-label').textContent = 'กำลังบีบอัด…';
  $('cancel').disabled = false; $('cancel').textContent = 'ยกเลิก';
  $('progress-panel').classList.remove('hidden'); $('progress-bar').style.width = '0%'; $('progress-percent').textContent = '0%';
  $('progress-status').textContent = 'กำลังเตรียมคิว…'; $('progress-detail').textContent = `${pending.length} ไฟล์จะประมวลผลทีละไฟล์`;
  renderQueue();
  for (let index = 0; index < pending.length; index++) {
    const item = pending[index];
    if (cancelRequested) break;
    currentItem = item; batchIndex = index; item.status = 'กำลังทำ'; lastFfmpegLog = '';
    renderQueue();
    $('progress-status').textContent = `กำลังเตรียมไฟล์ ${index + 1} จาก ${pending.length}`;
    $('progress-detail').textContent = item.file.name;
    $('progress-percent').textContent = `${Math.round((index / pending.length) * 100)}%`;
    $('progress-bar').style.width = `${Math.round((index / pending.length) * 100)}%`;
    let inputMounted = false;
    let outputPath = '';
    try {
      await ensureEngine();
      if (cancelRequested) break;
      await ffmpeg.createDir('/input');
      await ffmpeg.mount('WORKERFS', { files: [item.file] }, '/input');
      inputMounted = true;
      const safeName = item.file.name.replace(/[\\/]/g, '_') || 'video-input';
      const inputPath = `/input/${safeName}`;
      outputPath = `output-${index}-${Date.now()}.mp4`;
      const q = qualityData[Number(quality.value)];
      const args = ['-i',inputPath,'-map','0:v:0'];
      if ($('keep-audio').checked) args.push('-map','0:a?'); else args.push('-an');
      if ($('resize').checked) args.push('-vf','scale=w=1920:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2');
      args.push('-c:v','libx264','-preset',q.preset,'-crf',q.crf,'-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-metadata','comment=Compressed locally with Frame',outputPath);
      $('progress-status').textContent = `กำลังบีบอัดไฟล์ ${index + 1} จาก ${pending.length}`;
      const exitCode = await ffmpeg.exec(args);
      if (cancelRequested) { item.status = 'ยกเลิก'; break; }
      if (exitCode !== 0) throw new Error(`FFmpeg หยุดทำงาน (รหัส ${exitCode})${lastFfmpegLog ? `: ${lastFfmpegLog}` : ''}`);
      const data = await ffmpeg.readFile(outputPath);
      if (!data?.length) throw new Error('ไฟล์ผลลัพธ์ว่างเปล่า');
      const blob = new Blob([data], { type: 'video/mp4' });
      item.outputUrl = URL.createObjectURL(blob); item.outputSize = blob.size; item.status = 'เสร็จแล้ว';
      $('result-card').classList.remove('hidden'); addResult(item);
    } catch (err) {
      console.error(err);
      if (cancelRequested) { item.status = 'ยกเลิก'; break; }
      item.status = 'ผิดพลาด'; item.error = showCompressionError(err);
      showError(`${item.file.name}: ${item.error}`);
      const row = document.createElement('div'); row.className = 'result-item result-item-error'; row.textContent = `${item.file.name}: ${item.error}`; $('results-list').append(row); $('result-card').classList.remove('hidden');
    } finally {
      if (outputPath) await ffmpeg.deleteFile(outputPath).catch(() => {});
      if (inputMounted && ffmpegReady) { await ffmpeg.unmount('/input').catch(() => {}); await ffmpeg.deleteDir('/input').catch(() => {}); }
    }
    renderQueue();
  }
  currentItem = null; busy = false;
  const completed = pending.filter(item => item.status === 'เสร็จแล้ว').length;
  const failed = pending.filter(item => item.status === 'ผิดพลาด').length;
  if (cancelRequested) {
    $('progress-status').textContent = 'ยกเลิกคิวแล้ว'; $('progress-detail').textContent = 'ไฟล์ที่ยังไม่เริ่มจะคงอยู่ในคิว';
  } else {
    $('progress-status').textContent = 'ประมวลผลคิวเสร็จแล้ว'; $('progress-detail').textContent = `${completed} สำเร็จ${failed ? ` · ${failed} ผิดพลาด` : ''}`;
    $('progress-bar').style.width = '100%'; $('progress-percent').textContent = '100%';
  }
  $('cancel').textContent = 'ปิด'; $('cancel').disabled = false; renderQueue();
});

$('cancel').addEventListener('click', async () => {
  if (!busy) { $('progress-panel').classList.add('hidden'); return; }
  cancelRequested = true; $('progress-status').textContent = 'กำลังหยุดงาน…'; $('cancel').disabled = true;
  try { await ffmpeg.terminate(); } catch {}
  ffmpegReady = false;
  // The queue loop handles the terminated FFmpeg promise and restores controls.
});

window.addEventListener('beforeunload', () => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  queue.forEach(item => { if (item.outputUrl) URL.revokeObjectURL(item.outputUrl); });
});
