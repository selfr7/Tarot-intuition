(function () {
  'use strict';

  // ============ 状态 ============
  var SPREADS = {
    single: { count: 1, labels: ['今日指引'], name: '单牌指引' },
    triple: { count: 3, labels: ['过去', '现在', '未来'], name: '三牌阵' }
  };

  var SHUFFLE_TIPS = [
    '💡 尽量避免「是 / 否」类选择性问题，\n试试「我该如何看待…」「我在…中该注意什么」，\n牌面会给你更有启发性的回应。',
    '💡 问题越具体，牌面越有回应。\n与其问「我的事业会好吗」，\n不如问「我在现在的工作里该关注什么」。'
  ];

  var state = {
    spread: 'single',
    reversedOn: false,
    drawCount: 1,
    order: [],         // 抽牌顺序的 deck 下标
    flipped: [],       // 已翻开解读的位次下标
    current: 0,        // 当前正在解读的第几张
    noteTarget: null,  // 记录感受时的牌下标
    pool: []           // 牌堆剩余可抽的 deck 下标（洗乱）
  };

  var DECK = window.TAROT_DECK;      // 22 张牌数据
  var IMAGES = window.TAROT_IMAGES;  // id -> data:uri

  // ============ 工具 ============
  function $(id) { return document.getElementById(id); }

  function showView(name) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
    $('view-' + name).classList.add('active');
    window.scrollTo(0, 0);
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function dateStr() {
    var d = new Date();
    return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
  }

  // ============ 首页 ============
  function initHome() {
    var h = new Date().getHours();
    var g, s;
    if (h >= 5 && h < 11) { g = '清晨好 ☀️'; s = '新的一天开始了，<br>听听直觉想对你说什么。'; }
    else if (h >= 11 && h < 17) { g = '午后好 🌿'; s = '在忙碌的一天里，<br>留一分钟给内心深处的自己。'; }
    else if (h >= 17 && h < 23) { g = '暮色降临 🌆'; s = '一天渐渐安静下来，<br>适合听一听内心的声音。'; }
    else { g = '夜深了 🌙'; s = '万籁俱寂，<br>正是与潜意识对话的时刻。'; }
    $('greeting').textContent = g;
    $('greetingSub').innerHTML = s;

    // 首页背景图 + logo
    var assets = window.APP_ASSETS || {};
    if (assets.bg) $('homeBg').style.backgroundImage = 'url("' + assets.bg + '")';
    if (assets.logo) $('homeLogo').src = assets.logo;

    // 星光粒子
    var stars = $('stars');
    for (var i = 0; i < 26; i++) {
      var st = document.createElement('div');
      st.className = 'star';
      st.style.left = (Math.random() * 100) + '%';
      st.style.top = (Math.random() * 100) + '%';
      st.style.animationDelay = (Math.random() * 3) + 's';
      st.style.transform = 'scale(' + (0.5 + Math.random()) + ')';
      stars.appendChild(st);
    }

    $('cardBox').addEventListener('click', function () {
      showView('spread');
    });
  }

  // ============ 牌阵选择 ============
  function initSpread() {
    $('spreadSingle').addEventListener('click', function () { pickSpread('single'); });
    $('spreadTriple').addEventListener('click', function () { pickSpread('triple'); });
    $('btnBackHome').addEventListener('click', function () { showView('home'); });
    $('btnStartShuffle').addEventListener('click', startShuffle);

    $('reversedToggle').addEventListener('click', function () {
      state.reversedOn = !state.reversedOn;
      this.classList.toggle('on', state.reversedOn);
      this.setAttribute('aria-checked', state.reversedOn ? 'true' : 'false');
    });
  }

  function pickSpread(mode) {
    state.spread = mode;
    $('spreadSingle').classList.toggle('active', mode === 'single');
    $('spreadTriple').classList.toggle('active', mode === 'triple');
    $('hintSingle').style.display = mode === 'single' ? 'block' : 'none';
    $('hintTriple').style.display = mode === 'triple' ? 'block' : 'none';
  }

  // ============ 洗牌 ============
  var countdownTimer = null;
  function startShuffle() {
    state.drawCount = SPREADS[state.spread].count;
    showView('shuffle');
    $('shuffleTip').textContent = SHUFFLE_TIPS[Math.floor(Math.random() * SHUFFLE_TIPS.length)];
    // 倒计时 5 秒：5 → 1，每秒一切，结束后稍作停顿再进入抽牌
    var n = 5;
    $('countdown').textContent = n;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      n--;
      if (n <= 0) {
        clearInterval(countdownTimer);
        $('countdown').textContent = '✦';
        setTimeout(enterDraw, 600);
      } else {
        $('countdown').textContent = n;
      }
    }, 1000);
  }

  // ============ 抽牌（弧形牌堆点选 + 虚线框占位） ============
  var FAN_THETA_MAX = 40;  // 弧形两端最大偏转角（度），越大拱形越弯
  var FAN_ORIGIN = 300;    // 旋转轴距卡片顶部的距离（px），越小弧度越大
  var FAN_COUNT = 30;      // 牌堆展示张数（可多于牌库，点选时才从洗乱的牌库分配）

  function enterDraw() {
    state.order = [];
    state.flipped = [];
    state.current = 0;
    state.pool = shuffleArray(DECK.map(function (_, i) { return i; }));
    for (var c = 0; c < DECK.length; c++) delete DECK[c]._rev;
    renderDraw();
    showView('draw');
  }

  function buildFan() {
    var fan = $('fan');
    fan.innerHTML = '';
    var n = FAN_COUNT;
    var step = (FAN_THETA_MAX * 2) / (n - 1);
    for (var i = 0; i < n; i++) {
      var deg = -FAN_THETA_MAX + i * step;
      var el = document.createElement('div');
      el.className = 'fan-card';
      el.style.transform = 'rotate(' + deg.toFixed(2) + 'deg)';
      el.innerHTML = '<div class="sym">✦</div><div class="t">TAROT</div>';
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', '抽取这张牌');
      el.addEventListener('click', function (cardEl) {
        return function () {
          if (state.order.length >= state.drawCount) return;
          if (!state.pool.length) return;
          pickFromFan(state.pool.pop(), cardEl);
        };
      }(el));
      fan.appendChild(el);
    }
  }

  function renderSlots() {
    var wrap = $('slots');
    wrap.innerHTML = '';
    for (var i = 0; i < state.drawCount; i++) {
      var slot = document.createElement('div');
      slot.className = 'slot';
      var frame = document.createElement('div');
      frame.id = 'slotFrame' + i;

      if (i < state.order.length && state.flipped.indexOf(i) >= 0) {
        // 已翻开：显示牌面
        var card = cardAt(i);
        frame.className = 'slot-frame opened';
        frame.innerHTML = '<img src="' + IMAGES[card.id] + '" alt="' + card.name + '"' +
          (isReversed(i) ? ' class="reversed"' : '') + ' />';
      } else if (i < state.order.length) {
        // 已抽未翻：从左到右按顺序翻开，下一张带发光悬浮引导，其余锁定
        var allDrawn = state.order.length >= state.drawCount;
        var isNext = i === state.flipped.length;
        if (isNext) {
          frame.className = 'slot-frame ready' + (allDrawn ? ' next' : '');
        } else {
          frame.className = 'slot-frame ready locked';
        }
        frame.innerHTML =
          '<div class="slot-back" role="button" aria-label="翻开这张牌">' +
            '<div class="sym">✦</div><div class="t">TAROT</div>' +
          '</div>';
        (function (pos, frameEl) {
          frameEl.querySelector('.slot-back').addEventListener('click', function () {
            if (state.order.length < state.drawCount) {
              toast('先抽完 ' + state.drawCount + ' 张牌，再逐个翻开');
              return;
            }
            if (pos !== state.flipped.length) {
              toast('按顺序翻开：先翻开「' + labelAt(state.flipped.length) + '」');
              return;
            }
            flipInPlace(pos, frameEl);
          });
        })(i, frame);
      } else {
        frame.className = 'slot-frame empty';
      }

      slot.appendChild(frame);
      var label = document.createElement('div');
      label.className = 'slot-label';
      label.textContent = labelAt(i);
      slot.appendChild(label);
      wrap.appendChild(slot);
    }
  }

  var TRIPLE_MODES = [
    ['原因', '现状', '未来发展'],
    ['意识', '潜意识', '整合'],
    ['现状', '行动', '结果'],
    ['阻碍', '资源', '突破']
  ];

  function updateSlotMatrix() {
    var m = $('slotMatrix');
    if (state.spread !== 'triple') { m.style.display = 'none'; return; }
    m.style.display = 'grid';
    var html = '';
    for (var r = 0; r < TRIPLE_MODES.length; r++) {
      for (var c = 0; c < 3; c++) html += '<span>' + TRIPLE_MODES[r][c] + '</span>';
    }
    m.innerHTML = html;
  }

  function flipTipText() {
    return state.drawCount > 1
      ? '👆 请从左到右依次点击牌面，翻开它'
      : '👆 深呼吸，点击牌面，翻开它';
  }

  function renderDraw() {
    buildFan();
    renderSlots();
    updateSlotMatrix();
    $('fanWrap').classList.remove('done');
    $('fanHint').style.display = 'block';
    $('drawFlipTip').style.display = 'none';
    $('btnGoMeaning').style.display = 'none';
    $('btnDrawNote').style.display = 'none';
    $('btnDrawFinish').style.display = 'none';
    $('drawPrompt').textContent = state.drawCount > 1
      ? '凭直觉点选 ' + state.drawCount + ' 张牌'
      : '深呼吸，凭直觉点选 1 张牌';
  }

  function pickFromFan(deckIndex, cardEl) {
    if (state.order.length >= state.drawCount) return;
    if (state.order.indexOf(deckIndex) >= 0) return;

    cardEl.classList.add('picked');
    state.order.push(deckIndex);
    renderSlots();

    var left = state.drawCount - state.order.length;
    if (left > 0) {
      $('drawPrompt').textContent = '还差 ' + left + ' 张，凭直觉继续点选';
    } else {
      $('drawPrompt').textContent = '抽好了，深呼吸～';
      $('fanWrap').classList.add('done');
      $('fanHint').style.display = 'none';
      $('drawFlipTip').textContent = flipTipText();
      $('drawFlipTip').style.display = 'block';
    }
  }

  function flipInPlace(pos, frame) {
    state.current = pos;
    state.flipped.push(pos);
    var card = cardAt(pos);
    var rev = isReversed(pos);
    // 原地 3D 翻牌：牌背转到牌面，停留在本页继续翻下一张
    frame.className = 'slot-frame flipping';
    frame.innerHTML =
      '<div class="slot-flipper">' +
        '<div class="slot-back"><div class="sym">✦</div><div class="t">TAROT</div></div>' +
        '<div class="slot-face"><img src="' + IMAGES[card.id] + '" alt="' + card.name + '"' +
          (rev ? ' class="reversed"' : '') + ' /></div>' +
      '</div>';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        frame.classList.add('flipped');
      });
    });

    var nextFrame = $('slotFrame' + (pos + 1));
    if (pos + 1 < state.drawCount && nextFrame) {
      // 发光悬浮引导移到下一张
      nextFrame.classList.remove('locked');
      nextFrame.classList.add('next');
      $('drawPrompt').textContent = pos + 2 < state.drawCount
        ? '很好，接着从左到右翻开下一张'
        : '翻开最后一张牌';
    } else {
      // 全部翻完：解读 / 记录感受 / 直接完成，三条路都通
      $('drawPrompt').textContent = state.drawCount > 1 ? '三张牌都翻开了' : '牌翻开了';
      $('drawFlipTip').style.display = 'none';
      $('fanWrap').classList.add('done');
      $('btnGoMeaning').style.display = 'block';
      $('btnDrawNote').style.display = 'block';
      $('btnDrawFinish').style.display = 'block';
    }
  }

  // ============ 翻牌 / 牌面 / 牌意 ============
  function cardAt(pos) {
    return DECK[state.order[pos]];
  }

  function orientationAt(pos) {
    if (!state.reversedOn) return 'upright';
    // 每张牌独立 30% 逆位概率
    if (cardAt(pos)._rev === undefined) {
      cardAt(pos)._rev = Math.random() < 0.3 ? 'reversed' : 'upright';
    }
    return cardAt(pos)._rev;
  }

  function labelAt(pos) {
    return SPREADS[state.spread].labels[pos];
  }

  function isReversed(pos) {
    return orientationAt(pos) === 'reversed';
  }

  function showFaceView() {
    var pos = state.current;
    var card = cardAt(pos);
    var rev = isReversed(pos);
    $('facePosition').textContent = labelAt(pos);
    var img = $('faceImg');
    img.src = IMAGES[card.id];
    img.classList.toggle('reversed', rev);
    $('faceName').textContent = card.name + (rev ? ' · 逆位' : '');
    $('faceNameEn').textContent = card.nameEn;
    var tag = $('faceOrientation');
    tag.textContent = rev ? '逆位 Reversed' : '正位 Upright';
    tag.className = rev ? 'orientation-tag orientation-reversed' : 'orientation-tag orientation-upright';

    var willLast = state.flipped.length + 1 >= state.drawCount;
    $('btnFaceNext').textContent = willLast ? '完成本次抽牌 ✓' : '下一张 →';

    // 翻牌动画：先隐藏再翻
    var fc = $('faceCard');
    fc.classList.remove('flipped');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        fc.classList.add('flipped');
      });
    });
    showView('face');
  }

  // 受限 markdown → HTML：仅处理 **加粗**、*斜体*、- 列表、> 引用
  function mdToHtml(src) {
    var lines = String(src).replace(/\r\n/g, '\n').split('\n');
    var html = '', list = false, buf = [];
    function inline(t) {
      return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    }
    function flush() {
      if (list) { html += '</ul>'; list = false; }
      if (buf.length) { html += '<p>' + buf.join('<br>') + '</p>'; buf = []; }
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { flush(); continue; }
      if (line.charAt(0) === '>') {
        flush();
        html += '<p class="md-q">' + inline(line.replace(/^>\s*/, '')) + '</p>';
        continue;
      }
      if (line.indexOf('- ') === 0) {
        if (buf.length) { html += '<p>' + buf.join('<br>') + '</p>'; buf = []; }
        if (!list) { html += '<ul class="md-list">'; list = true; }
        html += '<li>' + inline(line.slice(2)) + '</li>';
        continue;
      }
      if (list) { html += '</ul>'; list = false; }
      buf.push(inline(line));
    }
    flush();
    return html;
  }

  function showMeaningView() {
    var pos = state.current;
    var card = cardAt(pos);
    var rev = isReversed(pos);
    var o = rev ? 'reversed' : 'upright';
    var kws = card.keywords[o] || [];

    $('meaningTitle').textContent = card.name + (rev ? ' · 逆位' : '');
    $('meaningSub').textContent = card.nameEn + ' ｜ ' + labelAt(pos);

    var kwHtml = '';
    for (var i = 0; i < kws.length; i++) kwHtml += '<span class="kw">' + kws[i] + '</span>';

    var html =
      '<div class="meaning-row">' +
        '<div class="meaning-label">🔑 关键词</div>' +
        '<div class="kw-list">' + kwHtml + '</div>' +
      '</div>' +
      '<div class="meaning-row">' +
        '<div class="meaning-label">📜 牌意</div>' +
        '<div class="meaning-text">' + (card.meaning[o] || '') + '</div>' +
      '</div>';

    if (card.imagerySections && card.imagerySections.length) {
      html += '<div class="meaning-row imagery-row">' +
        '<div class="meaning-label">🖼 牌面画面与象征</div>';
      for (var s = 0; s < card.imagerySections.length; s++) {
        var sec = card.imagerySections[s];
        if (sec.t) html += '<div class="img-sub">' + sec.t + '</div>';
        html += mdToHtml(sec.body);
      }
      html += '</div>';
    }
    if (card.deep) {
      html += '<div class="meaning-row">' +
        '<div class="meaning-label">🧠 深层解读</div>' +
        mdToHtml(card.deep) +
      '</div>';
    }
    if (rev && card.reversedReading) {
      // 逆位牌：用专属逆位解读替换正位向的占卜建议
      html += '<div class="meaning-row reversed-row">' +
        '<div class="meaning-label">🔄 逆位解读</div>' +
        mdToHtml(card.reversedReading) +
      '</div>';
    } else if (card.adviceMore) {
      html += '<div class="meaning-row">' +
        '<div class="meaning-label">💡 占卜中的建议</div>' +
        mdToHtml(card.adviceMore) +
      '</div>';
    } else {
      html += '<div class="meaning-row">' +
        '<div class="meaning-label">🌱 指引</div>' +
        '<div class="advice-text">' + (card.advice || '') + '</div>' +
      '</div>';
    }
    $('meaningBody').innerHTML = html;
    var sortedFlipped = flippedSorted();
    var isLastMeaning = state.current === sortedFlipped[sortedFlipped.length - 1];
    $('btnMeaningNext').textContent = isLastMeaning ? '完成本次抽牌 ✓' : '下一张 →';
    updateMeaningPager(pos);
    showView('meaning');
  }

  // 牌意页 1/N 翻页（仅在已翻开的牌之间切换）
  function flippedSorted() {
    return state.flipped.slice().sort(function (a, b) { return a - b; });
  }

  function updateMeaningPager(pos) {
    var pager = $('meaningPager');
    if (state.drawCount < 2) { pager.style.display = 'none'; return; }
    var flipped = flippedSorted();
    var idx = flipped.indexOf(pos);
    pager.style.display = 'flex';
    $('pagerText').textContent = (idx + 1) + ' / ' + state.drawCount;
    $('pagerPrev').disabled = idx <= 0;
    $('pagerNext').disabled = idx >= flipped.length - 1;
  }

  function pagerJump(delta) {
    var flipped = flippedSorted();
    var idx = flipped.indexOf(state.current);
    var target = flipped[idx + delta];
    if (target === undefined || target < 0) return;
    state.current = target;
    showMeaningView();
  }

  function goNext() {
    if (state.flipped.indexOf(state.current) < 0) {
      state.flipped.push(state.current);
    }
    if (state.flipped.length < state.drawCount) {
      // 还有牌未翻开，回到抽牌页继续翻（下一张已带发光引导）
      renderSlots();
      var left = state.drawCount - state.flipped.length;
      $('drawPrompt').textContent = left > 1 ? '继续翻开剩下的牌' : '翻开最后一张牌';
      $('drawFlipTip').textContent = flipTipText();
      showView('draw');
    } else {
      renderFinish();
      showView('finish');
    }
  }

  // ============ 结算 ============
  function renderFinish() {
    var html = '';
    for (var i = 0; i < state.drawCount; i++) {
      var card = cardAt(i);
      var rev = isReversed(i);
      html +=
        '<div class="finish-item">' +
          '<img class="finish-thumb' + (rev ? ' reversed' : '') + '" src="' + IMAGES[card.id] + '" alt="' + card.name + '" />' +
          '<div>' +
            '<div class="finish-name">' + card.name + (rev ? '（逆位）' : '') + '</div>' +
            '<div class="finish-meta">' + ((card.keywords[rev ? 'reversed' : 'upright'] || []).slice(0, 4).join(' · ')) + '</div>' +
          '</div>' +
        '</div>';
    }
    $('finishList').innerHTML = html;
  }

  // ---- 保存抽牌结果到相册（Canvas 合成 → saveImageToPhotosAlbum）----
  function loadCardImage(id) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image load fail')); };
      img.src = IMAGES[id];
    });
  }

  function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 等比裁剪填满目标框（同 object-fit: cover）
  function drawCover(ctx, img, x, y, w, h) {
    var sr = img.width / img.height, tr = w / h, sx, sy, sw, sh;
    if (sr > tr) { sh = img.height; sy = 0; sw = sh * tr; sx = (img.width - sw) / 2; }
    else { sw = img.width; sx = 0; sh = sw / tr; sy = (img.height - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  }

  function buildResultCanvas(imgs) {
    var n = imgs.length;
    var W = 900, gap = 44;
    var cardW = n === 1 ? 380 : (n === 2 ? 330 : 244);
    var cardH = Math.round(cardW * 1.58);
    var headH = 250;
    var H = headH + cardH + 190;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');

    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#232447');
    bg.addColorStop(0.5, '#171830');
    bg.addColorStop(1, '#0d0e1c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(217,185,108,0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(24, 24, W - 48, H - 48);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#d9b96c';
    ctx.font = '600 54px Georgia, "Times New Roman", "Songti SC", "SimSun", serif';
    ctx.fillText('今日塔罗', W / 2, 118);
    ctx.fillStyle = '#b5aecf';
    ctx.font = '26px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(dateStr() + ' · ' + SPREADS[state.spread].name, W / 2, 168);

    var x0 = (W - (n * cardW + (n - 1) * gap)) / 2;
    for (var i = 0; i < n; i++) {
      var x = x0 + i * (cardW + gap), y = headH;
      var card = cardAt(i), rev = isReversed(i);
      ctx.save();
      roundedRectPath(ctx, x, y, cardW, cardH, 18);
      ctx.clip();
      if (rev) {
        ctx.translate(x + cardW / 2, y + cardH / 2);
        ctx.rotate(Math.PI);
        ctx.translate(-(x + cardW / 2), -(y + cardH / 2));
      }
      drawCover(ctx, imgs[i], x, y, cardW, cardH);
      ctx.restore();
      ctx.strokeStyle = 'rgba(217,185,108,0.6)';
      ctx.lineWidth = 3;
      roundedRectPath(ctx, x, y, cardW, cardH, 18);
      ctx.stroke();

      ctx.fillStyle = '#e8e2d4';
      ctx.font = '600 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(card.name + (rev ? ' · 逆位' : ''), x + cardW / 2, y + cardH + 52);
    }

    ctx.fillStyle = 'rgba(217,185,108,0.5)';
    ctx.fillRect(W / 2 - 60, H - 92, 120, 1);
    ctx.fillStyle = '#8d86ac';
    ctx.font = '22px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText('记录你的直觉时刻', W / 2, H - 52);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  function saveResultToAlbum() {
    var mt = window.xhs && window.xhs.miniTool;
    if (!mt || typeof mt.saveImageToPhotosAlbum !== 'function') {
      toast('当前环境不支持保存到相册');
      return;
    }
    toast('正在生成图片…');
    var jobs = [];
    for (var i = 0; i < state.drawCount; i++) jobs.push(loadCardImage(cardAt(i).id));
    Promise.all(jobs).then(function (imgs) {
      return mt.saveImageToPhotosAlbum({ filePath: buildResultCanvas(imgs) });
    }).then(function () {
      toast('已保存到相册 ✓');
    }).catch(function () {
      toast('保存未完成，请再试一次');
    });
  }

  // ============ 记录感受 ============
  function openNoteModal() {
    state.noteTarget = state.current;
    var existing = '';
    if (state.noteTarget !== null && state.drawnNotes[state.noteTarget]) {
      existing = state.drawnNotes[state.noteTarget];
    }
    $('noteInput').value = existing;
    $('noteMask').classList.add('show');
  }

  function closeNoteModal() {
    $('noteMask').classList.remove('show');
  }

  state.drawnNotes = {};

  function saveNote() {
    var text = $('noteInput').value.replace(/^\s+|\s+$/g, '');
    if (!text) {
      toast('还没有输入感受哦，也可以直接取消～');
      return;
    }
    state.drawnNotes[state.noteTarget] = text;
    persistNote(state.noteTarget, text);
    closeNoteModal();
    toast('已记下这一刻的感受 ✓');
  }

  function persistNote(pos, text) {
    var card = cardAt(pos);
    var record = {
      date: dateStr(),
      spread: SPREADS[state.spread].name,
      position: labelAt(pos),
      card: card.name,
      orientation: isReversed(pos) ? '逆位' : '正位',
      note: text,
      savedAt: new Date().toISOString()
    };
    try {
      var history = JSON.parse(localStorage.getItem('tarot_diary') || '[]');
      history.unshift(record);
      localStorage.setItem('tarot_diary', JSON.stringify(history));
    } catch (e) {
      // localStorage 不可用时静默降级，本次会话内仍保留在内存
    }
  }

  // ============ 发笔记 ============
  function postToNote() {
    if (!window.xhs || !window.xhs.miniTool || typeof window.xhs.miniTool.postNote !== 'function') {
      toast('当前环境不支持发布笔记');
      return;
    }
    var images = [];
    var lines = [];
    for (var i = 0; i < state.drawCount; i++) {
      var card = cardAt(i);
      var rev = isReversed(i);
      images.push({ url: IMAGES[card.id] });
      lines.push('【' + labelAt(i) + '】' + card.name + (rev ? '（逆位）' : ''));
      lines.push((card.keywords[rev ? 'reversed' : 'upright'] || []).join(' · '));
      lines.push('');
      lines.push(card.meaning[rev ? 'reversed' : 'upright'] || '');
      lines.push('');
      var note = state.drawnNotes[i];
      if (note) {
        lines.push('💫 我的感受：' + note);
        lines.push('');
      }
    }
    var content =
      '🔮 今日塔罗 · ' + dateStr() + '\n' +
      '牌阵：' + SPREADS[state.spread].name + '\n\n' +
      lines.join('\n') +
      '——\n由「今日塔罗」小工具生成';

    var firstCard = cardAt(0);
    var title = ('今日塔罗 · ' + firstCard.name).slice(0, 20);

    window.xhs.miniTool.postNote({
      title: title,
      content: content.slice(0, 1000),
      pageType: 'photo_publish',
      mediaInfo: { image_resources: images },
      tags: '塔罗,今日塔罗,每日一抽'
    }).then(function () {
      toast('已唤起笔记发布，去发布吧 ✨');
    }).catch(function () {
      toast('发布未完成，请再试一次');
    });
  }

  // ============ 绑定 ============
  function init() {
    initHome();
    initSpread();

    $('btnViewMeaning').addEventListener('click', showMeaningView);
    $('btnGoMeaning').addEventListener('click', function () {
      state.current = 0;
      showMeaningView();
    });
    $('btnDrawNote').addEventListener('click', openNoteModal);
    $('btnDrawFinish').addEventListener('click', function () {
      // 不看解读，直接完成本次抽牌
      renderFinish();
      showView('finish');
    });
    $('pagerPrev').addEventListener('click', function () { pagerJump(-1); });
    $('pagerNext').addEventListener('click', function () { pagerJump(1); });
    $('btnFaceNote').addEventListener('click', openNoteModal);
    $('btnFaceNext').addEventListener('click', goNext);
    $('btnMeaningNext').addEventListener('click', function () {
      // 牌意页「下一张」：依次看每张牌的解读，最后一张则完成
      var sorted = flippedSorted();
      var idx = sorted.indexOf(state.current);
      if (idx >= 0 && idx < sorted.length - 1) {
        state.current = sorted[idx + 1];
        showMeaningView();
        return;
      }
      goNext();
    });
    $('btnMeaningNote').addEventListener('click', openNoteModal);
    $('btnMeaningBack').addEventListener('click', function () {
      // 返回翻完牌的抽牌页（单牌阵/三牌阵一致，均带查看牌意/记录感受/完成三个操作）
      showView('draw');
    });
    $('btnPostNote').addEventListener('click', postToNote);
    $('btnSaveAlbum').addEventListener('click', saveResultToAlbum);
    $('btnRestart').addEventListener('click', function () {
      state.drawnNotes = {};
      showView('spread');
    });

    $('btnNoteCancel').addEventListener('click', closeNoteModal);
    $('btnNoteSave').addEventListener('click', saveNote);
    $('noteMask').addEventListener('click', function (e) {
      if (e.target === this) closeNoteModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
