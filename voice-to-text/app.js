const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const transcript = document.querySelector('#transcript');
const interim = document.querySelector('#interim');
const recordButton = document.querySelector('#recordButton');
const recordLabel = document.querySelector('#recordLabel');
const language = document.querySelector('#language');
const status = document.querySelector('#status');
const charCount = document.querySelector('#charCount');
const duration = document.querySelector('#duration');
const emptyHint = document.querySelector('#emptyHint');
const clearButton = document.querySelector('#clearButton');
const undoButton = document.querySelector('#undoButton');
const copyButton = document.querySelector('#copyButton');
const downloadButton = document.querySelector('#downloadButton');
const supportNote = document.querySelector('#supportNote');
const toast = document.querySelector('#toast');
const compatWarning = document.querySelector('#compatWarning');
const copyLinkButton = document.querySelector('#copyLinkButton');

let recognition = null;
let isRecording = false;
let shouldContinue = false;
let startedAt = 0;
let elapsedBeforeStart = 0;
let timer = null;
let segments = [];
let heardSpeech = false;
let silenceTimer = null;
let noSpeechCount = 0;

const saved = localStorage.getItem('shengji-transcript');
if (saved) transcript.value = saved;
const savedLanguage = localStorage.getItem('shengji-language');
if (savedLanguage) language.value = savedLanguage;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 1800);
}

function updateMeta() {
  const clean = transcript.value.replace(/\s/g, '');
  charCount.textContent = clean.length;
  emptyHint.classList.toggle('hidden', Boolean(transcript.value || interim.textContent));
  undoButton.disabled = segments.length === 0;
  localStorage.setItem('shengji-transcript', transcript.value);
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function startTimer() {
  startedAt = Date.now();
  timer = setInterval(() => duration.textContent = formatTime(elapsedBeforeStart + Date.now() - startedAt), 250);
}

function stopTimer() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  elapsedBeforeStart += Date.now() - startedAt;
  duration.textContent = formatTime(elapsedBeforeStart);
}

function setRecordingUI(active) {
  isRecording = active;
  recordButton.classList.toggle('recording', active);
  document.body.classList.toggle('is-recording', active);
  recordLabel.textContent = active ? '停止录音' : '开始录音';
  status.classList.toggle('live', active);
  status.innerHTML = active ? '<i></i> 正在聆听…' : '<i></i> 已暂停';
  if (active) startTimer(); else {
    stopTimer();
    clearTimeout(silenceTimer);
  }
}

function showCompatibility(message = '请复制网址，改用最新版 Chrome 或 Edge 打开。') {
  compatWarning.hidden = false;
  compatWarning.querySelector('span').textContent = message;
  status.classList.remove('live');
  status.innerHTML = '<i></i> 浏览器不兼容';
}

function appendText(text) {
  if (!text.trim()) return;
  const before = transcript.value;
  const separator = before && !/\s$/.test(before) ? ' ' : '';
  const added = `${separator}${text.trim()}`;
  segments.push(added);
  transcript.value = before + added;
  transcript.scrollTop = transcript.scrollHeight;
  updateMeta();
}

function makeRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang = language.value;
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    heardSpeech = true;
    noSpeechCount = 0;
    clearTimeout(silenceTimer);
    let draft = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) appendText(text);
      else draft += text;
    }
    interim.textContent = draft;
    updateMeta();
  };

  recognition.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      shouldContinue = false;
      setRecordingUI(false);
      showToast('请在浏览器设置中允许麦克风权限');
    } else if (event.error === 'audio-capture') {
      shouldContinue = false;
      setRecordingUI(false);
      showCompatibility('浏览器没有取得麦克风音频，请使用 Chrome 或 Edge 并允许麦克风。');
    } else if (event.error === 'network') {
      shouldContinue = false;
      setRecordingUI(false);
      showCompatibility('语音识别服务无法连接，请改用 Chrome 或 Edge 后重试。');
    } else if (event.error === 'no-speech') {
      noSpeechCount += 1;
      if (noSpeechCount >= 2) {
        shouldContinue = false;
        setRecordingUI(false);
        showCompatibility('连续未检测到语音。请检查麦克风，或改用 Chrome / Edge 打开。');
      }
    } else if (event.error !== 'aborted') {
      showToast('识别暂时中断，请重试');
    }
  };

  recognition.onend = () => {
    interim.textContent = '';
    if (shouldContinue) {
      try { recognition.start(); } catch (_) {}
    } else if (isRecording) {
      setRecordingUI(false);
    }
  };
}

recordButton.addEventListener('click', async () => {
  if (!SpeechRecognition) {
    showToast('当前浏览器不支持语音识别');
    return;
  }
  if (isRecording) {
    shouldContinue = false;
    recognition.stop();
    setRecordingUI(false);
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showCompatibility();
    showToast('当前浏览器无法访问麦克风');
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
  } catch (_) {
    showCompatibility('未获得麦克风权限。请在 Chrome 或 Edge 中允许麦克风后重试。');
    showToast('没有麦克风权限');
    return;
  }

  compatWarning.hidden = true;
  heardSpeech = false;
  noSpeechCount = 0;
  makeRecognition();
  shouldContinue = true;
  try {
    recognition.start();
    setRecordingUI(true);
    silenceTimer = setTimeout(() => {
      if (isRecording && !heardSpeech) {
        shouldContinue = false;
        try { recognition.stop(); } catch (_) {}
        setRecordingUI(false);
        showCompatibility('已连接麦克风，但识别服务没有返回文字。请改用 Chrome 或 Edge 打开。');
      }
    }, 10000);
  } catch (_) {
    showToast('无法启动录音，请刷新后重试');
  }
});

language.addEventListener('change', () => {
  localStorage.setItem('shengji-language', language.value);
  if (isRecording) {
    shouldContinue = false;
    recognition.stop();
    setRecordingUI(false);
    showToast('语言已切换，请重新开始录音');
  }
});

transcript.addEventListener('input', updateMeta);

clearButton.addEventListener('click', () => {
  if (!transcript.value && !interim.textContent) return;
  if (!confirm('确定要清空全部文字吗？')) return;
  transcript.value = '';
  interim.textContent = '';
  segments = [];
  elapsedBeforeStart = 0;
  duration.textContent = '00:00';
  updateMeta();
});

undoButton.addEventListener('click', () => {
  const last = segments.pop();
  if (!last) return;
  transcript.value = transcript.value.slice(0, -last.length);
  updateMeta();
  showToast('已撤销上一段');
});

copyButton.addEventListener('click', async () => {
  if (!transcript.value.trim()) return showToast('还没有可复制的文字');
  try {
    await navigator.clipboard.writeText(transcript.value);
    showToast('文字已复制');
  } catch (_) {
    transcript.select();
    document.execCommand('copy');
    showToast('文字已复制');
  }
});

downloadButton.addEventListener('click', () => {
  if (!transcript.value.trim()) return showToast('还没有可下载的文字');
  const blob = new Blob([transcript.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `声迹转写-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('TXT 已下载');
});

if (!SpeechRecognition) {
  supportNote.textContent = '当前浏览器不支持实时语音识别，请使用最新版 Chrome 或 Edge 打开。';
  recordButton.setAttribute('aria-disabled', 'true');
}

copyLinkButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    showToast('网址已复制，请在 Chrome 或 Edge 打开');
  } catch (_) {
    showToast('请复制浏览器地址栏中的网址');
  }
});

updateMeta();
