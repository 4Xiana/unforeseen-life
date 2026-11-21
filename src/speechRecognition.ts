export interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: { results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export type RecognitionConstructor = new () => Recognition;
export type SpeechPhase = 'idle' | 'starting' | 'listening' | 'stopping' | 'ready';

export const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': '未获得麦克风权限，请在浏览器的网站设置中允许麦克风后重试。',
  'service-not-allowed': '当前浏览器无法提供语音识别服务，请用系统浏览器打开，或使用键盘上的语音输入。',
  'no-speech': '没有听清声音，请等麦克风就绪后再说一次。',
  'audio-capture': '无法使用麦克风，请检查设备是否连接、是否被其他应用占用。',
  network: '浏览器的语音识别服务连接失败。请检查网络，或使用手机键盘上的语音输入。',
  aborted: '录音已中断，识别到的文字已保留，可以重新开始。',
  'language-not-supported': '当前浏览器不支持中文语音识别，请尝试系统浏览器或键盘语音输入。',
};

interface Callbacks {
  onPhase: (phase: SpeechPhase) => void;
  onText: (text: string) => void;
  onCommit: (text: string) => void;
  onError: (message: string | null) => void;
}

interface Session {
  rec: Recognition;
  original: string;
  transcript: string;
  hold: boolean;
  started: boolean;
  stopped: boolean;
  ended: boolean;
  timeout?: ReturnType<typeof setTimeout>;
}

/**
 * One recognizer owns the microphone across all mounted inputs.
 * Each callback belongs to a session, so late events cannot overwrite a newer draft.
 */
export class SpeechInputController {
  private static owner: SpeechInputController | null = null;
  private session: Session | null = null;

  constructor(
    private readonly Ctor: RecognitionConstructor,
    private readonly callbacks: Callbacks,
  ) {}

  get active() { return this.session !== null; }

  start(original: string, hold = false) {
    if (this.session) return;
    SpeechInputController.owner?.cancel();
    this.callbacks.onError(null);
    let rec: Recognition;
    try {
      rec = new this.Ctor();
    } catch {
      this.callbacks.onError(SPEECH_ERRORS['service-not-allowed']);
      return;
    }
    const s: Session = { rec, original, transcript: '', hold, started: false, stopped: false, ended: false };
    this.session = s;
    SpeechInputController.owner = this;
    rec.lang = 'zh-CN';
    rec.continuous = hold;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.callbacks.onPhase('starting');
    s.timeout = setTimeout(() => {
      this.fail(s, '麦克风启动超时，请确认权限后重试，或使用键盘语音输入。');
    }, 12000);

    rec.onstart = () => {
      if (this.session !== s) return;
      clearTimeout(s.timeout);
      s.started = true;
      // A release while the permission prompt was open must not leave recording running.
      if (s.stopped) this.stopRecognition(s);
      else this.callbacks.onPhase('listening');
    };
    rec.onresult = event => {
      if (this.session !== s) return;
      // Results are a snapshot, not deltas. Re-reading avoids duplicated final segments
      // and preserves the last interim segment when Safari ends without a final event.
      s.transcript = Array.from(event.results, result => result[0]?.transcript ?? '').join('');
      this.callbacks.onText(this.text(s));
    };
    rec.onerror = event => {
      this.fail(s, SPEECH_ERRORS[event.error] ?? '语音识别暂时不可用，请重试或使用键盘语音输入。');
    };
    rec.onend = () => {
      if (this.session !== s) return;
      clearTimeout(s.timeout);
      s.ended = true;
      if (s.hold && !s.stopped && s.transcript.trim()) {
        // Some mobile recognizers end after a pause even with continuous=true.
        // Wait for the actual release instead of sending while the user is still holding.
        this.callbacks.onPhase('ready');
        return;
      }
      this.finish(s);
    };
    try {
      rec.start();
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      this.fail(s, name === 'NotAllowedError' ? SPEECH_ERRORS['not-allowed'] : '语音启动失败，请稍后再试。');
    }
  }

  stop() {
    const s = this.session;
    if (!s || s.stopped) return;
    s.stopped = true;
    this.callbacks.onPhase('stopping');
    if (s.ended) this.finish(s);
    else if (s.started) this.stopRecognition(s);
    // If still starting, onstart will stop it; calling stop() too early is unreliable.
  }

  /** A gesture cancellation restores the original draft; a submit/reset does not. */
  cancel(restoreOriginal = false) {
    const s = this.session;
    if (!s) return;
    this.release(s);
    if (restoreOriginal) this.callbacks.onText(s.original);
    this.callbacks.onPhase('idle');
  }

  dispose() {
    if (this.session) this.release(this.session);
  }

  private text(s: Session) {
    if (!s.transcript.trim()) return s.original;
    const base = s.original.trim() ? `${s.original.trimEnd()} ` : '';
    return base + s.transcript;
  }

  private stopRecognition(s: Session) {
    clearTimeout(s.timeout);
    s.timeout = setTimeout(() => {
      this.fail(s, '语音收尾超时，已识别的文字会保留，请检查后发送。');
    }, 5000);
    try {
      s.rec.stop();
    } catch {
      this.fail(s, '录音已中断，已识别的文字会保留，请检查后发送。');
    }
  }

  private finish(s: Session) {
    if (this.session !== s) return;
    const text = this.text(s);
    const hasSpeech = !!s.transcript.trim();
    const commit = s.hold && s.stopped && hasSpeech;
    this.release(s);
    this.callbacks.onPhase('idle');
    this.callbacks.onText(text);
    if (!hasSpeech) this.callbacks.onError(SPEECH_ERRORS['no-speech']);
    if (commit) this.callbacks.onCommit(text.trim());
  }

  private fail(s: Session, message: string) {
    if (this.session !== s) return;
    const text = this.text(s);
    this.release(s);
    this.callbacks.onPhase('idle');
    this.callbacks.onText(text);
    this.callbacks.onError(message);
    // Never auto-submit an old draft or a partial recording after an error.
  }

  private release(s: Session) {
    clearTimeout(s.timeout);
    s.rec.onstart = null;
    s.rec.onresult = null;
    s.rec.onerror = null;
    s.rec.onend = null;
    if (this.session === s) this.session = null;
    if (SpeechInputController.owner === this) SpeechInputController.owner = null;
    if (!s.ended) {
      try { s.rec.abort(); } catch { /* already stopped */ }
    }
  }
}
