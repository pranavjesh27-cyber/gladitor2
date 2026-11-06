/* =====================================================================
   Chennai Voice \u2014 Tamil-English route search widget
   ---------------------------------------------------------------------
   Chennai Voice loads this source from /api/agent-widget and imports this CSS.
   The same-origin /api/chat adapter uses /api/search; audio fallback uses /api/transcribe.
   ===================================================================== */
(function () {
  if (window.__VA_WIDGET__) return;
  window.__VA_WIDGET__ = true;

  const CFG = Object.assign({ serverUrl: window.location.origin, autoListen: true },
    (window.VA_CONFIG || {}));
  const API = String(CFG.serverUrl || '').replace(/\/$/, '');

  /* ------------------------------ state ------------------------------ */
  const S = {
    lang: 'en',                // 'en' | 'ta'
    listening: false,
    thinking: false,
    speaking: false,
    panelOpen: false,
    busy: false,
    messages: [],              // {role, content}
    routeContext: null,
    transcriptionEnabled: null,
    tamilWhisperConfigured: false,
    rec: null,                 // SpeechRecognition instance
    media: null,               // MediaRecorder fallback
    lastInterim: '',           // latest interim speech transcript
    handledUtterance: false,   // whether current recognition session already triggered handleUtterance
    warnedNoVoices: false
  };
  try {                        // survive page navigation (navigate action)
    const saved = JSON.parse(sessionStorage.getItem('chennai_voice_gtfs_session') || '{}');
    if (saved.messages) S.messages = saved.messages.slice(-16);
    if (saved.routeContext) S.routeContext = saved.routeContext;
    if (saved.lang === 'ta' || saved.lang === 'en') S.lang = saved.lang;
  } catch (e) { /* ignore */ }

  const persist = () => {
    try {
      sessionStorage.setItem('chennai_voice_gtfs_session',
        JSON.stringify({ messages: S.messages.slice(-16), routeContext: S.routeContext, lang: S.lang }));
    } catch (e) { /* ignore */ }
  };
  fetch(API + '/api/health', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(health => {
      if (health) {
        S.transcriptionEnabled = health.voiceTranscriptionEnabled === true;
        S.tamilWhisperConfigured = health.tamilWhisperConfigured === true;
      }
    })
    .catch(() => {});

  /* ------------------------------- DOM ------------------------------- */
  const root = document.createElement('div');
  root.id = 'va-root';
  root.innerHTML = `
    <div id="va-panel" role="dialog" aria-label="Voice assistant">
      <div id="va-panel-head">
        <span id="va-dot"></span>
        <strong>Chennai Voice \u00B7 Route Search</strong>
        <button id="va-lang" title="Switch speech language">EN</button>
        <button id="va-close" title="Close">&times;</button>
      </div>
      <div id="va-body">
        <div id="va-user" class="va-bubble va-me">Tap the mic and ask in Tamil or English\u2026</div>
        <div id="va-reply" class="va-bubble va-ai">Ask for a Chennai route or scheduled ride time. GTFS routes are static; fares and live arrivals are unavailable.</div>
        <div id="va-status">Ready</div>
      </div>
      <div id="va-foot">Tamil \u00B7 English \u00B7 Chennai GTFS routes</div>
    </div>
    <button id="va-orb" aria-label="Talk to Chennai Voice">
      <svg id="va-ic-mic" viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
      <svg id="va-ic-stop" viewBox="0 0 24 24" width="26" height="26" fill="currentColor" style="display:none"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>
    </button>
    <div id="va-toast"></div>`;
  document.body.appendChild(root);

  const $ = (id) => document.getElementById(id);
  const orb = $('va-orb'), panel = $('va-panel'), icMic = $('va-ic-mic'), icStop = $('va-ic-stop');
  const userB = $('va-user'), replyB = $('va-reply'), statusEl = $('va-status'), toastEl = $('va-toast');
  const langBtn = $('va-lang');

  const emitState = (statusText, transcript) => {
    const state = S.listening ? 'recording' : S.thinking ? 'transcribing' : S.speaking ? 'speaking' : 'idle';
    try {
      window.dispatchEvent(new CustomEvent('chennai:voice-state', {
        detail: { state, statusText: statusText || statusEl.textContent, transcript: transcript || '', lang: S.lang }
      }));
    } catch (e) { /* ignore */ }
  };

  const setStatus = (t, transcript) => { statusEl.textContent = t; emitState(t, transcript); };
  const say = (userTxt, replyTxt) => {
    if (userTxt !== undefined && userTxt !== null) userB.textContent = userTxt;
    if (replyTxt !== undefined && replyTxt !== null) {
      replyB.style.whiteSpace = 'pre-line';
      replyB.textContent = replyTxt;
    }
  };
  let toastTimer = null;
  const toast = (msg, ms = 3600) => {
    toastEl.textContent = msg; toastEl.classList.add('va-show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('va-show'), ms);
  };
  const transcriptionSetupMessage = () => S.lang === 'ta'
    ? '\u0B95\u0BC1\u0BB0\u0BB2\u0BCD \u0B8E\u0BB4\u0BC1\u0BA4\u0BCD\u0BA4\u0BBE\u0B95\u0BCD\u0B95\u0BAE\u0BCD \u0B85\u0BAE\u0BC8\u0B95\u0BCD\u0B95\u0BAA\u0BCD\u0BAA\u0B9F\u0BB5\u0BBF\u0BB2\u0BCD\u0BB2\u0BC8. \u0BA4\u0BBF\u0B9F\u0BCD\u0B9F\u0BA4\u0BCD\u0BA4\u0BBF\u0BA9\u0BCD .env.local \u0B95\u0BCB\u0BAA\u0BCD\u0BAA\u0BBF\u0BB2\u0BCD GROQ_API_KEY \u0B9A\u0BC7\u0BB0\u0BCD\u0BA4\u0BCD\u0BA4\u0BC1 npm run dev \u0B90 \u0BAE\u0BC0\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD \u0BA4\u0BCA\u0B9F\u0B99\u0BCD\u0B95\u0BB5\u0BC1\u0BAE\u0BCD, \u0B85\u0BB2\u0BCD\u0BB2\u0BA4\u0BC1 \u0B95\u0BC7\u0BB3\u0BCD\u0BB5\u0BBF\u0BAF\u0BC8 \u0B9F\u0BC8\u0BAA\u0BCD \u0B9A\u0BC6\u0BAF\u0BCD\u0BAF\u0BB5\u0BC1\u0BAE\u0BCD.'
    : 'Groq transcription is not configured. Add GROQ_API_KEY to the project root .env.local and restart npm run dev, or type your question.';

  /* --------------------------- text-to-speech ------------------------ */
  const isTamil = (t) => /[\u0B80-\u0BFF]/.test(t);
  let cachedVoices = [];
  const loadVoices = () => { cachedVoices = window.speechSynthesis ? speechSynthesis.getVoices() : []; };
  loadVoices();
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;

  function pickVoice(replyText) {
    loadVoices();
    const wantTamil = isTamil(replyText);
    const pool = cachedVoices.filter(v => wantTamil ? /^ta/i.test(v.lang) : /^(en-IN|en-GB|en-US|en)/i.test(v.lang));
    const prefer = wantTamil
      ? pool.find(v => /tamil|valluvar|pallavi/i.test(v.name)) || pool.find(v => /female/i.test(v.name))
      : pool.find(v => /en-IN|india|heera|ravi/i.test(v.lang + ' ' + v.name)) || pool.find(v => /google.*(uk|us) english female/i.test(v.name)) || pool.find(v => /female|zira|samantha/i.test(v.name));
    return prefer || pool[0] || null;
  }

  function speak(text, onDone, fallbackEnglish) {
    if (!text) { onDone && onDone(); return; }
    S.speaking = true; root.classList.add('va-speaking'); setStatus(S.lang === 'ta' ? '\u0BAA\u0BA4\u0BBF\u0BB2\u0BCD \u0B92\u0BB2\u0BBF\u0B95\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026' : 'Speaking\u2026');
    stopListening(true);
    if (!window.speechSynthesis) {
      S.speaking = false; root.classList.remove('va-speaking'); setStatus('Ready');
      onDone && onDone(); return;
    }
    try { speechSynthesis.cancel(); } catch (e) { }
    let v = pickVoice(text);
    let utteranceText = text;
    if (isTamil(text) && !v && fallbackEnglish) {
      utteranceText = fallbackEnglish;
      v = pickVoice(fallbackEnglish);
    }
    const u = new SpeechSynthesisUtterance(utteranceText);
    if (v) u.voice = v;
    u.lang = v ? v.lang : (isTamil(utteranceText) ? 'ta-IN' : 'en-IN');
    u.rate = 1.02; u.pitch = 1;
    let fired = false;
    const fin = () => {
      if (fired) return; fired = true;
      S.speaking = false; root.classList.remove('va-speaking'); setStatus('Ready');
      onDone && onDone();
    };
    u.onend = fin; u.onerror = fin;
    if (!cachedVoices.length && !S.warnedNoVoices) {
      S.warnedNoVoices = true;
      toast('No TTS voices in this browser \u2014 showing text only. Chrome on Windows/Mac/Android works best.');
    }
    speechSynthesis.speak(u);
    setTimeout(() => { if (S.speaking && !speechSynthesis.speaking) fin(); }, 4000 + utteranceText.length * 90);
  }

  /* -------------------------- speech-to-text ------------------------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  function startListening() {
    if (S.listening || S.thinking || S.busy) return;
    if (!SR || (S.lang === 'ta' && S.tamilWhisperConfigured)) { startRecordingFallback(); return; }
    try {
      const rec = new SR();
      S.rec = rec;
      S.lastInterim = '';
      S.handledUtterance = false;
      rec.lang = S.lang === 'ta' ? 'ta-IN' : 'en-IN';
      rec.interimResults = true; rec.maxAlternatives = 3;
      rec.onstart = () => {
        S.listening = true; root.classList.add('va-listening');
        setStatus(S.lang === 'ta' ? '\u0B95\u0BC7\u0B9F\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026 \u0B87\u0BAA\u0BCD\u0BAA\u0BCB\u0BA4\u0BC1 \u0BAA\u0BC7\u0B9A\u0BC1\u0B99\u0BCD\u0B95\u0BB3\u0BCD' : 'Listening\u2026 speak now');
        icMic.style.display = 'none'; icStop.style.display = '';
        say(S.lang === 'ta' ? '(\u0B95\u0BC7\u0B9F\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026)' : '(listening\u2026)', undefined);
      };
      rec.onresult = (ev) => {
        let interim = '', final = '';
        for (const res of ev.results) {
          if (res.isFinal) final += res[0].transcript; else interim += res[0].transcript;
        }
        const liveText = (final || interim).trim();
        if (liveText) S.lastInterim = liveText;
        say(liveText || '(listening\u2026)', undefined);
        emitState(S.lang === 'ta' ? '\u0B95\u0BC7\u0B9F\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026' : 'Listening\u2026', liveText);
        if (final && final.trim()) {
          S.handledUtterance = true;
          S.lastInterim = '';
          stopListening(true);
          handleUtterance(final.trim(), 0);
        }
      };
      rec.onerror = (ev) => {
        const pending = S.lastInterim.trim();
        stopListening(true);
        if (pending && !S.handledUtterance) {
          S.handledUtterance = true;
          S.lastInterim = '';
          handleUtterance(pending, 0);
          return;
        }
        if (ev.error === 'not-allowed') { toast('Microphone blocked \u2014 allow mic access for this site.'); setStatus('Mic blocked'); }
        else if (ev.error === 'no-speech') { toast('Heard nothing \u2014 tap and try again.'); setStatus('Ready'); }
        else if (ev.error === 'network' || ev.error === 'audio-capture') { startRecordingFallback(); }
        else if (ev.error !== 'aborted') { setStatus('Ready'); toast('Mic error: ' + ev.error); }
      };
      rec.onend = () => {
        const pending = S.lastInterim.trim();
        if (S.listening) stopListening(true);
        if (pending && !S.handledUtterance) {
          S.handledUtterance = true;
          S.lastInterim = '';
          handleUtterance(pending, 0);
        }
      };
      rec.start();
    } catch (e) { startRecordingFallback(); }
  }

  function stopListening(silent) {
    S.listening = false; root.classList.remove('va-listening');
    icMic.style.display = ''; icStop.style.display = 'none';
    try { if (S.rec) S.rec.stop(); } catch (e) { }
    S.rec = null;
    if (!silent) setStatus('Ready');
    if (S.media && S.media.state === 'recording') { try { S.media.stop(); } catch (e) { } }
  }

  /* Browser STT fallback: recorded audio is sent to the same-origin Groq route */
  async function startRecordingFallback() {
    if (S.transcriptionEnabled === false) {
      const message = transcriptionSetupMessage();
      setStatus('Voice setup needed');
      say(undefined, message);
      toast(message, 7000);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      S.media = media;
      const chunks = [];
      media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      media.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        S.listening = false; root.classList.remove('va-listening');
        icMic.style.display = ''; icStop.style.display = 'none';
        S.media = null;
        setStatus(S.lang === 'ta' ? 'Whisper \u0BAE\u0BC2\u0BB2\u0BAE\u0BCD \u0B8E\u0BB4\u0BC1\u0BA4\u0BCD\u0BA4\u0BBE\u0B95\u0BCD\u0B95\u0BC1\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026' : 'Transcribing with Whisper\u2026');
        const blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' });
        const fd = new FormData();
        fd.append('audio', blob, 'speech.webm');
        fd.append('language', S.lang);
        try {
          const r = await fetch(`${API}/api/transcribe`, { method: 'POST', body: fd });
          const d = await r.json();
          if (!r.ok) {
            if (d.error && d.error.code === 'STT_NOT_CONFIGURED') {
              S.transcriptionEnabled = false;
              const message = transcriptionSetupMessage();
              setStatus('Voice setup needed');
              say(undefined, message);
              toast(message, 7000);
            } else {
              setStatus('Ready');
              toast(d.error && d.error.message || 'Transcription failed. You can type your question instead.', 6000);
            }
            return;
          }
          if (d.transcript) handleUtterance(d.transcript);
          else { setStatus('Ready'); toast('Transcription empty \u2014 try again.'); }
        } catch (e) { setStatus('Ready'); toast('Transcription failed: ' + e.message); }
      };
      S.listening = true; root.classList.add('va-listening');
      setStatus(S.lang === 'ta' ? '\u0BAA\u0BC7\u0B9A\u0BB5\u0BC1\u0BAE\u0BCD\u2026 \u0BA8\u0BBF\u0BB1\u0BC1\u0BA4\u0BCD\u0BA4 \u0BAE\u0BC0\u0BA3\u0BCD\u0B9F\u0BC1\u0BAE\u0BCD \u0B85\u0BB4\u0BC1\u0BA4\u0BCD\u0BA4\u0BB5\u0BC1\u0BAE\u0BCD' : 'Recording\u2026 tap again to stop');
      say(S.lang === 'ta' ? '(\u0B95\u0BC7\u0B9F\u0BCD\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026 \u0BA4\u0BAE\u0BBF\u0BB4\u0BBF\u0BB2\u0BCD \u0BAA\u0BC7\u0B9A\u0BC1\u0B99\u0BCD\u0B95\u0BB3\u0BCD)' : '(recording\u2026)', undefined);
      icMic.style.display = 'none'; icStop.style.display = '';
      media.start();
      setTimeout(() => { try { if (S.media && S.media.state === 'recording') S.media.stop(); } catch (e) { } }, 5500);
    } catch (e) {
      S.listening = false; root.classList.remove('va-listening');
      icMic.style.display = ''; icStop.style.display = 'none';
      toast('Microphone unavailable: ' + e.message);
    }
  }

  /* ------------------------------ brain ------------------------------ */
  async function chat(payload) {
    const r = await fetch(`${API}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error && data.error.message || 'server ' + r.status);
    return data;
  }

  /* ---------------------- Chennai route-search brain ----------------- */
  async function handleUtterance(text) {
    if (S.busy || !text || !text.trim()) return;
    const cleanText = text.trim();
    if (isTamil(cleanText) && S.lang !== 'ta') {
      S.lang = 'ta';
      langBtn.textContent = '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD';
    }
    S.busy = true;
    S.thinking = true;
    root.classList.add('va-thinking');
    setStatus(S.lang === 'ta' ? '\u0B9A\u0BC6\u0BA9\u0BCD\u0BA9\u0BC8 \u0BB5\u0BB4\u0BBF\u0B95\u0BB3\u0BC8\u0BA4\u0BCD \u0BA4\u0BC7\u0B9F\u0BC1\u0B95\u0BBF\u0BB1\u0BA4\u0BC1\u2026' : 'Searching Chennai routes...', cleanText);
    say(cleanText, '...');
    S.messages.push({ role: 'user', content: cleanText });
    persist();
    try {
      const data = await chat({
        messages: S.messages.slice(-16),
        language: S.lang,
        previousJourneyContext: S.routeContext
      });
      const output = data.searchOutput;
      if (!output) throw new Error('Search response was incomplete.');
      if (output.status === 'found' && output.origin && output.destination) {
        S.routeContext = { originId: output.origin.id, destinationId: output.destination.id };
      }
      persist();
      window.dispatchEvent(new CustomEvent('chennai:voice-results', {
        detail: { query: cleanText, language: S.lang, output: output }
      }));
      const displayReply = String(
        (S.lang === 'ta' ? (output.answerTamil || output.answer) : (output.answer || output.answerEnglish))
        || data.reply
        || 'No matching sample route was found.'
      );
      const speechReply = String(output.speechText || displayReply);
      const fallbackEnglishSpeech = String(output.answerEnglish || displayReply).split('\n')[0];
      S.messages.push({ role: 'assistant', content: displayReply });
      persist();
      say(cleanText, displayReply);
      S.thinking = false;
      root.classList.remove('va-thinking');
      speak(speechReply, () => maybeAutoListen(speechReply), fallbackEnglishSpeech);
    } catch (err) {
      S.thinking = false;
      root.classList.remove('va-thinking');
      const msg = 'I could not reach Chennai Voice. Check that npm run dev is running, or type your search.';
      say(cleanText, msg);
      toast('Search failed: ' + err.message);
      speak(msg, () => { setStatus('Ready'); });
    } finally {
      S.busy = false;
    }
  }

  function maybeAutoListen(lastReply) {
    if (!CFG.autoListen || !S.panelOpen || S.busy) return;
    const expectsAnswer = /[?？]/.test(lastReply || '');
    if (expectsAnswer) {
      setTimeout(() => { if (!S.busy && !S.speaking && !S.listening && S.panelOpen) startListening(); }, 800);
    }
  }

  /* ------------------------------- UI -------------------------------- */
  function toggleMic() {
    if (S.listening) {
      const pending = S.lastInterim.trim();
      stopListening(false);
      if (pending && !S.handledUtterance) {
        S.handledUtterance = true;
        S.lastInterim = '';
        handleUtterance(pending, 0);
      }
      return;
    }
    openPanel();
    if (S.speaking) { try { speechSynthesis.cancel(); } catch (e) { } }
    startListening();
  }
  function openPanel() { S.panelOpen = true; panel.classList.add('va-open'); }
  function closePanel() { S.panelOpen = false; panel.classList.remove('va-open'); stopListening(false); }

  orb.addEventListener('click', toggleMic);
  $('va-close').addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });
  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    S.lang = S.lang === 'en' ? 'ta' : 'en';
    langBtn.textContent = S.lang === 'en' ? 'EN' : '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD';
    toast(S.lang === 'en' ? 'Speak in English now.' : '\u0B87\u0BAA\u0BCD\u0BAA\u0BCB\u0BA4\u0BC1 \u0BA4\u0BAE\u0BBF\u0BB4\u0BBF\u0BB2\u0BCD \u0BAA\u0BC7\u0B9A\u0BC1\u0B99\u0BCD\u0B95\u0BB3\u0BCD!');
    persist();
  });
  langBtn.textContent = S.lang === 'en' ? 'EN' : '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD';

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key || '').toLowerCase() === 'v') {
      e.preventDefault(); toggleMic();
    }
  });

  /* public mini-API \u2014 trigger the assistant from your own buttons */
  window.VoiceAssistant = {
    open: openPanel,
    close: closePanel,
    toggle: toggleMic,
    say: (t) => handleUtterance(String(t), 0),   // text command (debug/demo)
    setLang: (l) => { S.lang = l === 'ta' ? 'ta' : 'en'; langBtn.textContent = S.lang === 'en' ? 'EN' : '\u0BA4\u0BAE\u0BBF\u0BB4\u0BCD'; persist(); }
  };

  window.dispatchEvent(new Event('chennai:voice-assistant-ready'));
  setStatus('Ready');
})();

