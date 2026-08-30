// 冒烟测试：模拟最小 DOM，验证 洗牌→抽牌→翻开→下一张→完成 全流程
'use strict';
const fs = require('fs');
const assert = require('assert');

// ---------- 最小 DOM stub ----------
const registry = {};
function classListFactory(set) {
  return {
    add: (...cs) => cs.forEach(c => set.add(c)),
    remove: (...cs) => cs.forEach(c => set.delete(c)),
    toggle: (c, force) => {
      if (force === undefined) { set.has(c) ? set.delete(c) : set.add(c); }
      else { force ? set.add(c) : set.delete(c); }
    },
    contains: c => set.has(c),
  };
}
function makeEl(id) {
  const set = new Set();
  const el = {
    id: id || '', children: [], style: {}, _handlers: {}, _set: set,
    get classList() { return classListFactory(set); },
    set className(v) { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => set.add(c)); },
    get className() { return [...set].join(' '); },
    _innerHTML: '',
    set innerHTML(v) { this._innerHTML = v; this.children.length = 0; this._q = null; },
    get innerHTML() { return this._innerHTML; },
    textContent: '', src: '',
    addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn); },
    click() { (this._handlers.click || []).forEach(fn => fn({ target: this })); },
    setAttribute() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector(sel) {
      if (!this._q) { this._q = makeEl(null); this._q._sel = sel; }
      return this._q;
    },
  };
  if (id) registry[id] = el;
  return el;
}

const VIEW_IDS = ['home', 'spread', 'shuffle', 'draw', 'back', 'face', 'meaning', 'finish'];
const viewEls = VIEW_IDS.map(v => {
  const el = makeEl('view-' + v);
  el._set = el._set; // noop
  return el;
});

let timeouts = [];
let intervalCb = null;

global.document = {
  readyState: 'complete',
  getElementById: id => registry[id] || makeEl(id),
  querySelectorAll: () => viewEls,
  createElement: () => makeEl(null),
  addEventListener: () => {},
};
global.window = global;
global.scrollTo = () => {};
global.localStorage = { getItem: () => null, setItem: () => {} };
global.setTimeout = fn => { timeouts.push(fn); return timeouts.length; };
global.clearTimeout = () => {};
global.setInterval = fn => { intervalCb = fn; return 1; };
global.clearInterval = () => { intervalCb = null; };
global.requestAnimationFrame = fn => { fn(); return 0; };

// ---------- 假数据（78 张） ----------
global.TAROT_DECK = Array.from({ length: 22 }, (_, i) => ({
  id: 'c' + i, name: '牌' + i, nameEn: 'Card' + i,
  keywords: { upright: ['k1', 'k2'], reversed: ['r1', 'r2'] },
  meaning: { upright: 'mu', reversed: 'mr' },
  advice: 'adv',
}));
global.TAROT_IMAGES = {};
global.TAROT_DECK.forEach(c => { global.TAROT_IMAGES[c.id] = 'img://' + c.id; });
global.APP_ASSETS = { bg: null, logo: null };

// ---------- 加载 app.js ----------
eval(fs.readFileSync(require('path').join(__dirname, 'app.js'), 'utf8'));

function activeView() {
  for (const v of VIEW_IDS) {
    const el = registry['view-' + v];
    if (el._set.has('active')) return v;
  }
  return '(none)';
}

// ---------- 测试流程 ----------
// 1. 选三牌阵
registry['spreadTriple'].click();
console.log('选三牌阵 ✓');

// 2. 开始洗牌（5 秒倒计时，手动驱动 interval）
registry['btnStartShuffle'].click();
console.log('洗牌开始，当前视图:', activeView());
assert.strictEqual(activeView(), 'shuffle');

for (let i = 0; i < 8 && intervalCb; i++) intervalCb(); // 倒计时 5→0
let guard = 0;
while (timeouts.length && guard++ < 100) timeouts.shift()();
console.log('倒计时结束，当前视图:', activeView());
assert.strictEqual(activeView(), 'draw', '倒计时后应进入抽牌页');

// 3. 抽牌页结构
const fan = registry['fan'];
const slots = registry['slots'];
console.log('fan 卡片数:', fan.children.length, '| slot 数:', slots.children.length);
assert.strictEqual(fan.children.length, 30, 'fan 应有 30 张牌背');
assert.strictEqual(slots.children.length, 3, '三牌阵应有 3 个 slot');
assert.ok(registry['drawPrompt'].textContent.includes('3'), '提示应含 3');

// 4. 抽 3 张
fan.children.slice(0, 3).forEach(c => c.click());
console.log('抽完 3 张，提示:', registry['drawPrompt'].textContent);
assert.strictEqual(registry['fanWrap']._set.has('done'), true, '抽满后 fanWrap 应 done');
assert.ok(registry['drawFlipTip'].style.display === 'block', '应显示翻牌提示');

// 5. 乱序点击被拦截
slots.children[2].children[0].querySelector('.slot-back').click();
assert.ok(registry['toast'].textContent.includes('按顺序'), '乱序点击应有顺序提示');
console.log('乱序点击拦截 ✓ 提示:', registry['toast'].textContent);

// 6. 逐张原地翻开（不跳转）
for (let pos = 0; pos < 3; pos++) {
  const back = slots.children[pos].children[0].querySelector('.slot-back');
  assert.ok(back, 'slot ' + pos + ' 应有可点击牌背');
  back.click();
  console.log('原地翻开第 ' + (pos + 1) + ' 张，当前视图:', activeView());
  assert.strictEqual(activeView(), 'draw', '原地翻开，不应跳转');
}
assert.strictEqual(registry['btnGoMeaning'].style.display, 'block', '全部翻开后应显示查看牌意按钮');

// 7. 查看牌意 → 逐张解读 → 完成
registry['btnGoMeaning'].click();
console.log('进入牌意页，当前视图:', activeView());
assert.strictEqual(activeView(), 'meaning', '应进入牌意页');
assert.strictEqual(registry['pagerText'].textContent, '1 / 3', '应从第 1 张开始');
registry['btnMeaningNext'].click();
assert.strictEqual(registry['pagerText'].textContent, '2 / 3', '下一张应切到第 2 张牌意');
registry['btnMeaningNext'].click();
assert.strictEqual(registry['pagerText'].textContent, '3 / 3', '下一张应切到第 3 张牌意');
console.log('  最后按钮文字:', registry['btnMeaningNext'].textContent);
registry['btnMeaningNext'].click();
console.log('完成解读，当前视图:', activeView());
assert.strictEqual(activeView(), 'finish', '全部解读完应进结算页');

console.log('\n✅ 全流程冒烟测试通过');
