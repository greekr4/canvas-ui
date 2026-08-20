/**
 * 기초: 조작 (basics-2) — b5-transform / b6-slice / b7-focus / b8-hover
 * 코어 CanvasUI.create만 사용하는 최소 예제 4페이지.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-basics-2';
  var CSS = [
    '/* ── 기초: 조작 공용 카드 ── */',
    '.bm-card {',
    '  width: 300px; box-sizing: border-box;',
    '  background: var(--cui-card); border: 1px solid var(--cui-border);',
    '  border-radius: var(--cui-radius); padding: 20px;',
    '  display: flex; flex-direction: column; gap: 12px;',
    '  box-shadow: var(--cui-shadow);',
    '}',
    '.bm-title { font-size: 15px; font-weight: 700; color: var(--cui-fg); }',
    '.bm-hint { font-size: 12px; color: var(--cui-muted); }',
    '.bm-input {',
    '  box-sizing: border-box; width: 100%; padding: 10px 12px;',
    '  font-size: 14px; color: var(--cui-fg); background: var(--cui-bg);',
    '  border: 1px solid var(--cui-border); border-radius: 8px; outline: none;',
    '}',
    '.bm-input:focus { border-color: var(--cui-primary); }',
    '.bm-btn {',
    '  padding: 10px 14px; font-size: 14px; border-radius: 8px;',
    '  border: 1px solid var(--cui-border); background: var(--cui-bg);',
    '  color: var(--cui-fg); cursor: pointer; transition: transform .12s, background .12s;',
    '}',
    '/* 실제 :hover는 canvas 위라 안 걸림 → .cui-hover와 반드시 쌍선언 */',
    '.bm-btn:hover, .bm-btn.cui-hover { background: var(--cui-primary); color: #fff; transform: translateY(-2px); }',
    '.bm-btn:active, .bm-btn.cui-active { transform: translateY(1px) scale(0.97); }',
    '/* 쌍선언을 "안 한" 대조군: :hover만 선언 → canvas에서는 반응 없음 */',
    '.bm-btn-nopair {',
    '  padding: 10px 14px; font-size: 14px; border-radius: 8px;',
    '  border: 1px solid var(--cui-border); background: var(--cui-bg);',
    '  color: var(--cui-fg); cursor: pointer;',
    '}',
    '.bm-btn-nopair:hover { background: var(--cui-primary); color: #fff; }',
    '',
    '/* knobs */',
    '.bm-knobs { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }',
    '@media (max-width: 640px) { .bm-knobs { grid-template-columns: 1fr; } }',
    '.bm-knob { display: flex; flex-direction: column; gap: 6px; }',
    '.bm-knob label { font-size: 13px; color: var(--cui-muted); display: flex; justify-content: space-between; }',
    '.bm-knob label output { color: var(--cui-fg); font-variant-numeric: tabular-nums; }',
    '.bm-knob input[type="range"] { width: 100%; accent-color: var(--cui-primary); }',
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return; // 중복 주입 가드
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /** 공용 knobs 빌더: [label, key, min, max, step] 배열로 슬라이더 그리드 생성 */
  function buildKnobs(el, params, defs) {
    injectStyle();
    var grid = document.createElement('div');
    grid.className = 'bm-knobs';
    el.appendChild(grid);
    defs.forEach(function (d) {
      var wrap = document.createElement('div');
      wrap.className = 'bm-knob';
      var lab = document.createElement('label');
      lab.appendChild(document.createTextNode(d[0] + ' '));
      var out = document.createElement('output');
      out.textContent = params[d[1]];
      lab.appendChild(out);
      var input = document.createElement('input');
      input.type = 'range';
      input.min = d[2]; input.max = d[3]; input.step = d[4];
      input.value = params[d[1]];
      input.addEventListener('input', function () {
        params[d[1]] = Number(input.value);
        out.textContent = input.value;
      });
      wrap.appendChild(lab);
      wrap.appendChild(input);
      grid.appendChild(wrap);
    });
  }

  // ════════════════════════════════════════════════════════════
  // b5-transform — 회전·스케일·filter(hue/blur) 변형 복사
  // ════════════════════════════════════════════════════════════
  window.CUIDocs.register({
    id: 'b5-transform',
    name: '변형과 필터',
    emoji: '🌀',
    section: 'basics',
    oneLiner: '촬영본을 회전·스케일·필터로 변형해 그리기',
    code: [
      "CanvasUI.create({",
      "  mount: el, html: '<div class=\"card\">…</div>',",
      "  width: 480, height: 300,",
      "  effect(ctx, src, t, api) {",
      "    // ctx.filter는 CSS filter 문자열 그대로",
      "    ctx.filter = 'hue-rotate(' + p.hue + 'deg) blur(' + p.blur + 'px)';",
      "    ctx.translate(api.center.x + src.width / 2, api.center.y + src.height / 2);",
      "    ctx.rotate(p.rotate * Math.PI / 180);",
      "    ctx.scale(p.scale, p.scale);",
      "    ctx.drawImage(src, -src.width / 2, -src.height / 2);",
      "  },",
      "});",
    ].join('\n'),
    mount: function (el) {
      injectStyle();
      var params = { rotate: 12, scale: 0.9, hue: 0, blur: 0 };
      var api = CanvasUI.create({
        mount: el,
        html: [
          '<div class="bm-card">',
          '  <div class="bm-title">변형 대상 카드</div>',
          '  <button class="bm-btn" type="button">살아있는 버튼</button>',
          '  <div class="bm-hint">아래 슬라이더로 변형·필터를 조절해 보세요</div>',
          '</div>',
        ].join('\n'),
        width: 480,
        height: 300,
        effect: function (ctx, src, t, a) {
          ctx.save();
          ctx.filter = 'hue-rotate(' + params.hue + 'deg) blur(' + params.blur + 'px)';
          ctx.translate(a.center.x + src.width / 2, a.center.y + src.height / 2);
          ctx.rotate(params.rotate * Math.PI / 180);
          ctx.scale(params.scale, params.scale);
          ctx.drawImage(src, -src.width / 2, -src.height / 2);
          ctx.restore();
        },
      });
      api._params = params;
      return api;
    },
    knobs: function (el, api) {
      buildKnobs(el, api._params, [
        ['회전 (도)', 'rotate', -180, 180, 1],
        ['스케일', 'scale', 0.3, 1.6, 0.05],
        ['색조 회전 (hue)', 'hue', 0, 360, 1],
        ['블러 (px)', 'blur', 0, 8, 0.5],
      ]);
    },
  });

  // ════════════════════════════════════════════════════════════
  // b6-slice — 세로 조각 사인 웨이브 (drawImage 소스 사각형)
  // ════════════════════════════════════════════════════════════
  window.CUIDocs.register({
    id: 'b6-slice',
    name: '조각 웨이브',
    emoji: '🌊',
    section: 'basics',
    oneLiner: '세로 조각으로 잘라 사인 웨이브로 출렁이기',
    code: [
      "CanvasUI.create({",
      "  mount: el, html: '…', width: 480, height: 300,",
      "  effect(ctx, src, t, api) {",
      "    // drawImage 9인자: 소스 사각형(sx,sy,sw,sh) → 목적 사각형(dx,dy,dw,dh)",
      "    for (var x = 0; x < src.width; x += p.sliceW) {",
      "      var dy = Math.sin(t / 1000 * p.speed + x * p.freq) * p.amp;",
      "      ctx.drawImage(src, x, 0, p.sliceW, src.height,",
      "        api.center.x + x, api.center.y + dy, p.sliceW, src.height);",
      "    }",
      "  },",
      "});",
    ].join('\n'),
    mount: function (el) {
      injectStyle();
      var params = { sliceW: 8, amp: 10, freq: 0.04, speed: 3 };
      var api = CanvasUI.create({
        mount: el,
        html: [
          '<div class="bm-card">',
          '  <div class="bm-title">조각나서 출렁이는 카드</div>',
          '  <button class="bm-btn" type="button">그래도 눌리는 버튼</button>',
          '  <div class="bm-hint">조각 폭·진폭·주파수를 조절해 보세요</div>',
          '</div>',
        ].join('\n'),
        width: 480,
        height: 300,
        effect: function (ctx, src, t, a) {
          for (var x = 0; x < src.width; x += params.sliceW) {
            var w = Math.min(params.sliceW, src.width - x);
            var dy = Math.sin(t / 1000 * params.speed + x * params.freq) * params.amp;
            ctx.drawImage(src, x, 0, w, src.height,
              a.center.x + x, a.center.y + dy, w, src.height);
          }
        },
      });
      api._params = params;
      return api;
    },
    knobs: function (el, api) {
      buildKnobs(el, api._params, [
        ['조각 폭 (px)', 'sliceW', 2, 40, 1],
        ['진폭 (px)', 'amp', 0, 40, 1],
        ['주파수', 'freq', 0.01, 0.2, 0.01],
        ['속도', 'speed', 0.5, 10, 0.5],
      ]);
    },
  });

  // ════════════════════════════════════════════════════════════
  // b7-focus — 진짜 input 포커스 포워딩 (코어 interactive만)
  // ════════════════════════════════════════════════════════════
  window.CUIDocs.register({
    id: 'b7-focus',
    name: '입력 포커스',
    emoji: '⌨️',
    section: 'basics',
    oneLiner: '캔버스 클릭으로 진짜 input에 포커스·타이핑',
    code: [
      "// 코어 기본 interactive만으로 충분 — effect도 없음.",
      "// pointerdown 시 코어가 e.preventDefault()로 canvas 포커스 탈취를 막고",
      "// 좌표 히트된 input에 el.focus() → 이후 키보드·한글 IME는 브라우저가 처리,",
      "// 다음 프레임 촬영에 자동 반영된다.",
      "CanvasUI.create({",
      "  mount: el,",
      "  html: '<div class=\"card\"><input placeholder=\"클릭 후 타이핑\"></div>',",
      "  width: 480, height: 260,",
      "});",
    ].join('\n'),
    mount: function (el) {
      injectStyle();
      return CanvasUI.create({
        mount: el,
        html: [
          '<div class="bm-card">',
          '  <div class="bm-title">진짜 입력 필드</div>',
          '  <input class="bm-input" type="text" placeholder="캔버스를 클릭하고 타이핑 (한글 OK)">',
          '  <input class="bm-input" type="text" placeholder="두 번째 필드 — 클릭으로 포커스 이동">',
          '  <div class="bm-hint">빈 곳을 클릭하면 포커스가 해제됩니다</div>',
          '</div>',
        ].join('\n'),
        width: 480,
        height: 260,
      });
    },
  });

  // ════════════════════════════════════════════════════════════
  // b8-hover — .cui-hover 시뮬레이션과 CSS 쌍선언
  // ════════════════════════════════════════════════════════════
  window.CUIDocs.register({
    id: 'b8-hover',
    name: '호버 시뮬레이션',
    emoji: '👆',
    section: 'basics',
    oneLiner: ':hover 대신 .cui-hover 클래스를 쌍선언하기',
    code: [
      "/* 실제 :hover는 포인터가 canvas 위에 있어 절대 안 걸린다.",
      "   코어가 히트된 요소에 .cui-hover / .cui-active 클래스를 넣어주므로",
      "   CSS에서 반드시 쌍으로 선언한다. */",
      ".btn:hover, .btn.cui-hover { background: var(--cui-primary); }",
      ".btn:active, .btn.cui-active { transform: scale(0.97); }",
      "",
      "/* :hover만 선언한 대조군은 canvas에서 아무 반응이 없다 */",
      ".btn-nopair:hover { background: var(--cui-primary); }",
    ].join('\n'),
    mount: function (el) {
      injectStyle();
      return CanvasUI.create({
        mount: el,
        html: [
          '<div class="bm-card">',
          '  <div class="bm-title">두 버튼에 마우스를 올려 보세요</div>',
          '  <button class="bm-btn" type="button">쌍선언 O — 호버 반응함</button>',
          '  <button class="bm-btn-nopair" type="button">:hover만 — 반응 없음</button>',
          '  <div class="bm-hint">위: :hover + .cui-hover 쌍선언 / 아래: :hover 단독</div>',
          '</div>',
        ].join('\n'),
        width: 480,
        height: 300,
      });
    },
  });
})();
