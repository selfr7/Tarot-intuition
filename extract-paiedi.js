// 数据补充脚本：从「塔罗牌意/」文件夹提取 22 张大阿卡纳的
//   1) 牌面细节（画面 + 象征细节，含各 #### 小节）
//   2) 深层心理解读（无则回退「心理层面」小节）
//   3) 在占卜中的建议（无则回退「实践应用」小节）
// 注入 tarot-cards.json 对应牌的 imagerySections / deep / adviceMore 字段。
// 牌库仅用 22 张大牌（见 PRD），小牌文件不注入以控制包体。
// 文件名形如 01-the-fool.md，对应牌库 id 去掉「the-」前缀（the-fool → fool）。
// 用法：node extract-paiedi.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, '塔罗牌意');
const JSON_PATH = path.join(ROOT, 'tarot-cards.json');

// 把 markdown 按标题行切成 {level,title,start,contentStart} 列表
function parseHeads(body) {
  const re = /^(#{2,6}) (.+)$/gm;
  const heads = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    heads.push({ level: m[1].length, title: m[2].trim(), start: m.index, contentStart: m.index + m[0].length });
  }
  return heads;
}

// 指定层级与标题前缀的小节正文（边界是下一个同级或更高级标题）
function sectionText(heads, body, level, prefix) {
  const idx = heads.findIndex(h => h.level === level && h.title.indexOf(prefix) === 0);
  if (idx < 0) return null;
  for (let j = idx + 1; j < heads.length; j++) {
    if (heads[j].level <= level) return body.slice(heads[idx].contentStart, heads[j].start).trim();
  }
  return body.slice(heads[idx].contentStart).trim();
}

// 上一小节内部的下一级 #### 小节列表 [{t, body}]
function subSections(heads, body, level, prefix) {
  const idx = heads.findIndex(h => h.level === level && h.title.indexOf(prefix) === 0);
  if (idx < 0) return [];
  const out = [];
  for (let j = idx + 1; j < heads.length; j++) {
    if (heads[j].level <= level) break;
    if (heads[j].level !== level + 1) continue;
    let end = body.length;
    for (let k = j + 1; k < heads.length; k++) {
      if (heads[k].level <= level + 1) { end = heads[k].start; break; }
    }
    out.push({ t: heads[j].title, body: body.slice(heads[j].contentStart, end).trim() });
  }
  return out;
}

const deck = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
const files = fs.readdirSync(SRC).filter(f => /^\d+-.*\.md$/.test(f) && !f.startsWith('00-')).sort();

let injected = 0;
const problems = [];

for (const f of files) {
  const lookup = f.replace(/^\d+-/, '').replace(/\.md$/, '').replace(/^the-/, '');
  const card = deck.find(c => c.id === lookup && c.arcana === 'major');
  if (!card) continue; // 小牌不在牌库中，跳过

  const body = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
  const heads = parseHeads(body);

  const detail = sectionText(heads, body, 3, '牌面细节');
  const deep = sectionText(heads, body, 4, '深层心理') || sectionText(heads, body, 4, '心理层面');
  const advice = sectionText(heads, body, 4, '在占卜中的建议') || sectionText(heads, body, 4, '实践应用');
  const reversed = sectionText(heads, body, 4, '逆位解读');
  const subs = subSections(heads, body, 3, '牌面细节');

  if (!detail || !subs.length) { problems.push(f + ': 缺少「牌面细节」或其小节'); continue; }
  if (!deep) { problems.push(f + ': 缺少「深层解读」'); continue; }

  delete card.imagery;  // 清理旧版补充字段
  delete card.symbols;
  card.imagerySections = subs;
  card.deep = deep;
  if (advice) card.adviceMore = advice; else delete card.adviceMore;
  if (reversed) card.reversedReading = reversed; else delete card.reversedReading;
  injected++;

  console.log(lookup + ': 画面小节 ' + subs.length + ' | 深层 ' + (deep ? '✓' : '✗') + ' | 建议 ' + (advice ? '✓' : '回退默认') + ' | 逆位解读 ' + (reversed ? '✓' : '无'));
}

fs.writeFileSync(JSON_PATH, JSON.stringify(deck, null, 2) + '\n', 'utf8');
console.log('\n已注入 ' + injected + ' 张大牌 → tarot-cards.json');
if (problems.length) { console.log('问题清单:'); problems.forEach(p => console.log(' - ' + p)); }
