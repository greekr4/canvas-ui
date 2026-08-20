/**
 * 기초: 캡처 — 4페이지 (b1-capture, b2-live, b3-css-anim, b4-typography)
 * CanvasUI.create 기반 최소 구현. 촬영/paint 흐름은 코어가 내장.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-basics-1';
  var CSS = [
    '.b1-card, .b2-card, .b3-card, .b4-card {',
    '  width: 340px; box-sizing: border-box;',
    '  background: var(--cui-card); border: 1px solid var(--cui-border);',
    '  border-radius: var(--cui-radius); padding: 24px;',
    '  display: flex; flex-direction: column; gap: 14px;',
    '  box-shadow: var(--cui-shadow); color: var(--cui-fg);',
    '}',
    '.b1-card button, .b2-card button {',
    '  font: inherit; padding: 8px 14px; border-radius: 8px; cursor: pointer;',
    '  border: 1px solid var(--cui-border); background: var(--cui-primary); color: #fff;',
    '}',
    '.b1-card button.cui-hover, .b2-card button.cui-hover { filter: brightness(1.12); }',
    '.b1-card button.cui-active, .b2-card button.cui-active { transform: translateY(1px); }',
    '.b1-count, .b2-num { font-size: 40px; font-weight: 700; line-height: 1;',
    '  font-variant-numeric: tabular-nums; color: var(--cui-primary); }',
    '.b1-row { display: flex; gap: 8px; }',
    '.b1-hint, .b2-hint, .b3-hint, .b4-cap { font-size: 12px; color: var(--cui-muted); }',
    '.b2-clock { font-size: 28px; font-weight: 600; font-variant-numeric: tabular-nums; }',
    '',
    '/* b3: CSS keyframes 애니메이션 */',
    '.b3-dots { display: flex; gap: 10px; height: 44px; align-items: flex-end; }',
    '.b3-dot { width: 18px; height: 18px; border-radius: 50%; background: var(--cui-primary);',
    '  animation: b3-bounce 1s ease-in-out infinite; }',
    '.b3-dot:nth-child(2) { animation-delay: 0.15s; opacity: 0.8; }',
    '.b3-dot:nth-child(3) { animation-delay: 0.3s; opacity: 0.6; }',
    '@keyframes b3-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-26px); } }',
    '.b3-bar { height: 6px; border-radius: 3px; background: var(--cui-primary);',
    '  animation: b3-grow 2s ease-in-out infinite alternate; }',
    '@keyframes b3-grow { from { width: 15%; } to { width: 100%; } }',
    '',
    '/* b4: 한글 타이포그래피 */',
    '.b4-title { font-size: 18px; font-weight: 700; word-break: keep-all; line-height: 1.5; }',
    '.b4-ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
    '  font-size: 14px; }',
    '.b4-emoji { font-size: 26px; letter-spacing: 4px; }',
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return; // 중복 주입 가드
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ── b1: 정적 캡처 — 버튼을 눌러 1회 촬영(정지 사진) ──
  var B1_CODE = [
    "const frozen = document.createElement('canvas'); // 정지 사진 버퍼",
    "let hasShot = false;",
    "const api = CanvasUI.create({",
    "  mount: el,",
    "  html: `<div class=\"b1-card\"> 카운터 + [+1] [📸 촬영] 버튼 </div>`,",
    "  width: 520, height: 320,",
    "  effect(ctx, src, t, a) {",
    "    ctx.drawImage(src, a.center.x, a.center.y); // 살아있는 화면",
    "    if (hasShot) {                              // 마지막 촬영본(정지)",
    "      const s = 0.4;",
    "      ctx.drawImage(frozen, a.fx.width - frozen.width * s - 10,",
    "        a.fx.height - frozen.height * s - 10, frozen.width * s, frozen.height * s);",
    "    }",
    "  },",
    "});",
    "shotBtn.addEventListener('click', () => {",
    "  frozen.width = api.src.width; frozen.height = api.src.height;",
    "  frozen.getContext('2d').drawImage(api.src, 0, 0); // 소스 canvas → 정지 버퍼",
    "  hasShot = true;",
    "});",
  ].join('\n');

  window.CUIDocs.register({
    id: 'b1-capture',
    name: '정적 캡처',
    emoji: '📸',
    section: 'basics',
    oneLiner: '버튼을 눌러 살아있는 DOM을 1회 촬영한다',
    code: B1_CODE,
    mount: function (el) {
      injectStyle();
      var frozen = document.createElement('canvas'); // 정지 사진 버퍼
      var hasShot = false;
      var api = CanvasUI.create({
        mount: el,
        html: [
          '<div class="b1-card">',
          '  <div class="b1-count">0</div>',
          '  <div class="b1-row">',
          '    <button class="b1-plus">+1</button>',
          '    <button class="b1-shot">📸 촬영</button>',
          '  </div>',
          '  <div class="b1-hint">촬영하면 우하단에 그 순간이 멈춰 남습니다</div>',
          '</div>',
        ].join('\n'),
        width: 520,
        height: 320,
        effect: function (ctx, src, t, a) {
          ctx.drawImage(src, a.center.x, a.center.y); // 살아있는 화면
          if (hasShot) {                              // 마지막 촬영본(정지)
            var s = 0.4;
            ctx.drawImage(frozen, a.fx.width - frozen.width * s - 10,
              a.fx.height - frozen.height * s - 10, frozen.width * s, frozen.height * s);
          }
        },
      });
      var countEl = api.root.querySelector('.b1-count');
      api.root.querySelector('.b1-plus').addEventListener('click', function () {
        countEl.textContent = Number(countEl.textContent) + 1;
      });
      api.root.querySelector('.b1-shot').addEventListener('click', function () {
        frozen.width = api.src.width; frozen.height = api.src.height;
        frozen.getContext('2d').drawImage(api.src, 0, 0); // 소스 canvas → 정지 버퍼
        hasShot = true;
      });
      return api;
    },
  });

  // ── b2: 살아있는 DOM — paint 이벤트/requestPaint 흐름 ──
  var B2_CODE = [
    "// 촬영 모델(코어 내장):",
    "//  1) rAF마다 src.requestPaint()로 재촬영을 '요청'만 한다",
    "//  2) 브라우저가 src를 페인트하면 src의 'paint' 이벤트가 발생",
    "//  3) paint 핸들러 안에서만 drawElementImage 촬영이 안정",
    "//     (밖에서 하면 \"No cached paint record\" 실패)",
    "const api = CanvasUI.create({",
    "  mount: el,",
    "  html: `<div class=\"b2-card\"> 시계 + 카운터 + [+1] </div>`,",
    "  width: 520, height: 300,",
    "  onFrame(t, a) { // 매 프레임 DOM 텍스트만 갱신 — 다음 촬영에 자동 반영",
    "    clock.textContent = new Date().toLocaleTimeString('ko-KR');",
    "  },",
    "});",
    "plusBtn.addEventListener('click', () => num.textContent = Number(num.textContent) + 1);",
  ].join('\n');

  window.CUIDocs.register({
    id: 'b2-live',
    name: '살아있는 DOM',
    emoji: '⏱️',
    section: 'basics',
    oneLiner: '시계·카운터 변화가 매 프레임 촬영에 반영된다',
    code: B2_CODE,
    mount: function (el) {
      injectStyle();
      // 촬영 모델(코어 내장): rAF에서 src.requestPaint() 요청 →
      // src의 'paint' 이벤트 핸들러 안에서 drawElementImage 촬영.
      var api = CanvasUI.create({
        mount: el,
        html: [
          '<div class="b2-card">',
          '  <div class="b2-clock">--:--:--</div>',
          '  <div class="b2-num">0</div>',
          '  <button class="b2-plus">+1</button>',
          '  <div class="b2-hint">DOM만 바꾸면 다음 촬영에 자동 반영됩니다</div>',
          '</div>',
        ].join('\n'),
        width: 520,
        height: 300,
        onFrame: function () { // 매 프레임 DOM 텍스트만 갱신
          clock.textContent = new Date().toLocaleTimeString('ko-KR');
        },
      });
      var clock = api.root.querySelector('.b2-clock');
      var num = api.root.querySelector('.b2-num');
      api.root.querySelector('.b2-plus').addEventListener('click', function () {
        num.textContent = Number(num.textContent) + 1;
      });
      return api;
    },
  });

  // ── b3: CSS keyframes 애니메이션이 촬영에 반영 ──
  var B3_CODE = [
    "// JS 없이 CSS @keyframes만 선언 — 브라우저가 매 프레임 페인트하고,",
    "// 코어가 rAF마다 requestPaint → paint에서 촬영하므로 그대로 담긴다.",
    "const api = CanvasUI.create({",
    "  mount: el,",
    "  html: `",
    "    <div class=\"b3-card\">",
    "      <div class=\"b3-dots\"><i class=\"b3-dot\"></i><i class=\"b3-dot\"></i><i class=\"b3-dot\"></i></div>",
    "      <div class=\"b3-bar\"></div>",
    "      <div class=\"b3-hint\">CSS 애니메이션도 그대로 촬영됩니다</div>",
    "    </div>`,",
    "  width: 520, height: 280,",
    "});",
  ].join('\n');

  window.CUIDocs.register({
    id: 'b3-css-anim',
    name: 'CSS 애니메이션',
    emoji: '🎞️',
    section: 'basics',
    oneLiner: 'CSS keyframes 애니메이션이 촬영에 그대로 담긴다',
    code: B3_CODE,
    mount: function (el) {
      injectStyle();
      return CanvasUI.create({
        mount: el,
        html: [
          '<div class="b3-card">',
          '  <div class="b3-dots"><i class="b3-dot"></i><i class="b3-dot"></i><i class="b3-dot"></i></div>',
          '  <div class="b3-bar"></div>',
          '  <div class="b3-hint">CSS 애니메이션도 그대로 촬영됩니다</div>',
          '</div>',
        ].join('\n'),
        width: 520,
        height: 280,
      });
    },
  });

  // ── b4: 한글 타이포그래피 렌더 품질 ──
  var B4_CODE = [
    "// word-break:keep-all 줄바꿈, text-overflow:ellipsis, 이모지가",
    "// 촬영본에서 원본 DOM과 동일하게 렌더되는지 확인하는 페이지.",
    "const api = CanvasUI.create({",
    "  mount: el,",
    "  html: `",
    "    <div class=\"b4-card\">",
    "      <div class=\"b4-title\">한글 줄바꿈은 어절 단위로 끊겨야 자연스럽게 읽힙니다</div>",
    "      <div class=\"b4-ellipsis\">이 문장은 길어서 말줄임표로 잘리는 것이 정상 동작입니다 …까지 보이면 성공</div>",
    "      <div class=\"b4-emoji\">🎨 🖌️ 🇰🇷 👍🏽 🧑‍💻</div>",
    "      <div class=\"b4-cap\">keep-all · ellipsis · 이모지(ZWJ/스킨톤 포함)</div>",
    "    </div>`,",
    "  width: 520, height: 300,",
    "});",
  ].join('\n');

  window.CUIDocs.register({
    id: 'b4-typography',
    name: '한글 타이포그래피',
    emoji: '✍️',
    section: 'basics',
    oneLiner: 'keep-all 줄바꿈·말줄임·이모지 렌더 품질 확인',
    code: B4_CODE,
    mount: function (el) {
      injectStyle();
      return CanvasUI.create({
        mount: el,
        html: [
          '<div class="b4-card">',
          '  <div class="b4-title">한글 줄바꿈은 어절 단위로 끊겨야 자연스럽게 읽힙니다</div>',
          '  <div class="b4-ellipsis">이 문장은 길어서 말줄임표로 잘리는 것이 정상 동작입니다 …까지 보이면 성공</div>',
          '  <div class="b4-emoji">🎨 🖌️ 🇰🇷 👍🏽 🧑‍💻</div>',
          '  <div class="b4-cap">keep-all · ellipsis · 이모지(ZWJ/스킨톤 포함)</div>',
          '</div>',
        ].join('\n'),
        width: 520,
        height: 300,
      });
    },
  });
})();
