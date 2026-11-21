import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechInputController, type Recognition, type SpeechPhase } from '../src/speechRecognition';

class FakeRecognition implements Recognition {
  static last: FakeRecognition;
  lang = '';
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  starts = 0;
  stops = 0;
  aborts = 0;
  onstart: Recognition['onstart'] = null;
  onresult: Recognition['onresult'] = null;
  onerror: Recognition['onerror'] = null;
  onend: Recognition['onend'] = null;
  constructor() { FakeRecognition.last = this; }
  start() { this.starts++; }
  stop() { this.stops++; }
  abort() { this.aborts++; }
  result(...segments: [string, boolean][]) {
    this.onresult?.({results: segments.map(([transcript, isFinal]) => ({0: {transcript}, length: 1, isFinal}))});
  }
}

function setup(t: TestContext) {
  const phases: SpeechPhase[] = [];
  const texts: string[] = [];
  const commits: string[] = [];
  const errors: (string | null)[] = [];
  const engine = new SpeechInputController(FakeRecognition, {
    onPhase: p => phases.push(p), onText: text => texts.push(text),
    onCommit: text => commits.push(text), onError: error => errors.push(error),
  });
  t.after(() => engine.dispose());
  return {engine, phases, texts, commits, errors};
}

test('waits for onstart before showing listening; a permission-prompt release queues stop', t => {
  const {engine, phases, commits} = setup(t);
  engine.start('', true);
  const rec = FakeRecognition.last;
  assert.equal(phases.at(-1), 'starting');
  engine.stop();
  assert.equal(rec.stops, 0);
  rec.onstart?.();
  assert.equal(rec.stops, 1);
  rec.onend?.();
  assert.equal(phases.at(-1), 'idle');
  assert.deepEqual(commits, []);
});

test('keeps interim speech when the mobile recognizer ends without a final result', t => {
  const {engine, texts, commits} = setup(t);
  engine.start('', true);
  const rec = FakeRecognition.last;
  rec.onstart?.();
  rec.result(['我在家，有十五分钟', false]);
  engine.stop();
  rec.onend?.();
  assert.equal(texts.at(-1), '我在家，有十五分钟');
  assert.deepEqual(commits, ['我在家，有十五分钟']);
});

test('repeated final snapshots do not duplicate words and retain all segments', t => {
  const {engine, texts, commits} = setup(t);
  engine.start('原有文字');
  const rec = FakeRecognition.last;
  rec.onstart?.();
  rec.result(['在家', true], ['半', false]);
  rec.result(['在家', true], ['半小时', true]);
  engine.stop();
  rec.onend?.();
  assert.equal(texts.at(-1), '原有文字 在家半小时');
  assert.deepEqual(commits, [], 'click dictation never auto-submits');
});

test('a service error cannot submit the pre-existing draft', t => {
  const {engine, texts, commits, errors} = setup(t);
  engine.start('在家，半小时', true);
  FakeRecognition.last.onerror?.({error:'not-allowed'});
  assert.equal(engine.active, false);
  assert.equal(texts.at(-1), '在家，半小时');
  assert.deepEqual(commits, []);
  assert.match(errors.at(-1)!, /麦克风权限/);
});

test('network failures preserve partial speech for editing without auto-submission', t => {
  const {engine, texts, commits, errors} = setup(t);
  engine.start('', true);
  const rec = FakeRecognition.last;
  rec.onstart?.();
  rec.result(['想去散步', false]);
  rec.onerror?.({error:'network'});
  engine.stop();
  assert.equal(texts.at(-1), '想去散步');
  assert.deepEqual(commits, []);
  assert.match(errors.at(-1)!, /连接失败/);
});

test('natural mobile recognition end waits for release in hold mode', t => {
  const {engine, phases, commits} = setup(t);
  engine.start('', true);
  const rec = FakeRecognition.last;
  rec.onstart?.();
  rec.result(['给我推荐一条支线', true]);
  rec.onend?.();
  assert.equal(phases.at(-1), 'ready');
  assert.deepEqual(commits, []);
  engine.stop();
  engine.stop();
  assert.deepEqual(commits, ['给我推荐一条支线']);
});

test('gesture cancellation restores the original draft and ignores late results', t => {
  const {engine, texts, commits} = setup(t);
  engine.start('已有草稿', true);
  const rec = FakeRecognition.last;
  const lateResult = rec.onresult;
  const lateEnd = rec.onend;
  rec.onstart?.();
  rec.result(['不想发送', false]);
  engine.cancel(true);
  lateResult?.({results:[{0:{transcript:'迟来的结果'},length:1,isFinal:true}]});
  lateEnd?.();
  assert.equal(texts.at(-1), '已有草稿');
  assert.equal(rec.aborts, 1);
  assert.deepEqual(commits, []);
});

test('an old callback cannot end or overwrite a newer recognition session', t => {
  const {engine, texts} = setup(t);
  engine.start('第一轮');
  const old = FakeRecognition.last;
  const lateError = old.onerror;
  const lateEnd = old.onend;
  engine.cancel();
  engine.start('第二轮');
  const next = FakeRecognition.last;
  next.onstart?.();
  next.result(['新文字', true]);
  lateError?.({error:'network'});
  lateEnd?.();
  assert.equal(engine.active, true);
  assert.equal(texts.at(-1), '第二轮 新文字');
});

test('the newest input exclusively owns the microphone', t => {
  const first = setup(t);
  const second = setup(t);
  first.engine.start('');
  const rec = FakeRecognition.last;
  second.engine.start('');
  assert.equal(first.engine.active, false);
  assert.equal(rec.aborts, 1);
  assert.equal(second.engine.active, true);
});

test('disposing releases the microphone without callbacks or submission', t => {
  const {engine, phases, commits} = setup(t);
  engine.start('', true);
  const rec = FakeRecognition.last;
  rec.onstart?.();
  const count = phases.length;
  engine.dispose();
  assert.equal(rec.aborts, 1);
  assert.equal(phases.length, count);
  assert.deepEqual(commits, []);
});

test('startup timeout releases resources and can be retried', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const {engine, errors} = setup(t);
  engine.start('');
  const rec = FakeRecognition.last;
  t.mock.timers.tick(12001);
  assert.equal(engine.active, false);
  assert.equal(rec.aborts, 1);
  assert.match(errors.at(-1)!, /启动超时/);
  engine.start('');
  assert.equal(engine.active, true);
});

test('stop timeout preserves speech but does not automatically send uncertain content', t => {
  t.mock.timers.enable({apis:['setTimeout']});
  const {engine, texts, commits, errors} = setup(t);
  engine.start('', true);
  const rec = FakeRecognition.last;
  rec.onstart?.();
  rec.result(['部分文字', false]);
  engine.stop();
  t.mock.timers.tick(5001);
  assert.equal(engine.active, false);
  assert.equal(texts.at(-1), '部分文字');
  assert.deepEqual(commits, []);
  assert.match(errors.at(-1)!, /收尾超时/);
});

test('a synchronous start error returns to idle', t => {
  const {engine, phases, errors} = setup(t);
  const original = FakeRecognition.prototype.start;
  FakeRecognition.prototype.start = () => { throw new DOMException('denied', 'NotAllowedError'); };
  try {
    engine.start('', true);
    assert.equal(engine.active, false);
    assert.equal(phases.at(-1), 'idle');
    assert.match(errors.at(-1)!, /权限/);
  } finally { FakeRecognition.prototype.start = original; }
});
