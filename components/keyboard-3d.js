(function () {
  'use strict';

  var ID = 'keyboard-3d';

  // ── 컴포넌트 고유 CSS (중복 주입 가드) ──
  function injectStyle() {
    if (document.getElementById('cui-style-' + ID)) return;
    var style = document.createElement('style');
    style.id = 'cui-style-' + ID;
    style.textContent = [
      '/* 실제 :hover는 canvas 위라 안 걸리므로 .cui-hover / .cui-active 를 함께 선언 */',
      '.kbd3d { width: max-content; padding: 8px; }',
      '.kbd3d-input { margin-bottom: 16px; box-sizing: border-box; }',
      '.kbd3d-board {',
      '  background: var(--cui-card); border: 1px solid var(--cui-border);',
      '  border-radius: var(--cui-radius); box-shadow: var(--cui-shadow);',
      '  padding: 16px; display: flex; flex-direction: column; gap: 8px;',
      '}',
      '.kbd3d-row { display: flex; justify-content: center; gap: 5px; }',
      '.kbd3d-key {',
      '  width: 40px; height: 40px; padding: 0;',
      '  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;',
      '  background: var(--cui-bg); color: var(--cui-fg);',
      '  border: 1px solid var(--cui-border); border-radius: 8px;',
      '  font-family: var(--cui-font); cursor: pointer;',
      '  box-shadow: 0 2px 0 var(--cui-border);',
      '  transition: transform 0.06s, box-shadow 0.06s, border-color 0.12s, background 0.12s;',
      '}',
      '.kbd3d-key .k-ko { font-size: 10px; color: var(--cui-muted); line-height: 1; }',
      '.kbd3d-key .k-en { font-size: 12px; font-weight: 600; line-height: 1; }',
      '.kbd3d-key.k-fn .k-en { font-size: 10px; color: var(--cui-muted); font-weight: 500; }',
      '.kbd3d-key.k-w125 { width: 53px; } .kbd3d-key.k-w15 { width: 65px; }',
      '.kbd3d-key.k-w175 { width: 76px; } .kbd3d-key.k-w2 { width: 85px; }',
      '.kbd3d-key.k-w225 { width: 96px; } .kbd3d-key.k-w275 { width: 119px; }',
      '.kbd3d-key:hover, .kbd3d-key.cui-hover { border-color: var(--cui-muted); background: var(--cui-card); }',
      '.kbd3d-key:active, .kbd3d-key.cui-active {',
      '  transform: translateY(2px); box-shadow: 0 0 0 var(--cui-border);',
      '  border-color: var(--cui-primary); background: var(--cui-card);',
      '}',
      '.kbd3d-key.kbd3d-space { width: 260px; }',
      '.kbd3d-key.kbd3d-space .k-en { font-size: 12px; color: var(--cui-muted); font-weight: 500; }',
      '/* knobs 컨트롤 */',
      '.kbd3d-knobs { display: flex; flex-wrap: wrap; gap: 24px; align-items: end; }',
      '.kbd3d-knobs .field { min-width: 200px; }',
      '.kbd3d-knobs input[type="range"] { width: 100%; accent-color: var(--cui-primary); }',
      '.kbd3d-knobs input[type="color"] {',
      '  width: 48px; height: 32px; padding: 2px; border: 1px solid var(--cui-border);',
      '  border-radius: 8px; background: var(--cui-bg); cursor: pointer;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ── 키캡 데이터: F1~F12 포함 컴팩트(75%) 레이아웃 ──
  // K(라벨, 입력문자|null, e.code, 폭클래스, 특수동작)
  function K(l, k, c, w, act) { return { l: l, k: k, c: c, w: w || '', act: act || null }; }
  var KO = { q:'ㅂ', w:'ㅈ', e:'ㄷ', r:'ㄱ', t:'ㅅ', y:'ㅛ', u:'ㅕ', i:'ㅑ', o:'ㅐ', p:'ㅔ',
             a:'ㅁ', s:'ㄴ', d:'ㅇ', f:'ㄹ', g:'ㅎ', h:'ㅗ', j:'ㅓ', k:'ㅏ', l:'ㅣ',
             z:'ㅋ', x:'ㅌ', c:'ㅊ', v:'ㅍ', b:'ㅠ', n:'ㅜ', m:'ㅡ' };
  function letters(str) {
    return str.split('').map(function (ch) { return K(ch.toUpperCase(), ch, 'Key' + ch.toUpperCase()); });
  }
  var ROWS = [
    [K('Esc', null, 'Escape', 'k-fn')].concat(
      [1,2,3,4,5,6,7,8,9,10,11,12].map(function (n) { return K('F' + n, null, 'F' + n, 'k-fn'); })
    ),
    [K('`', '`', 'Backquote')].concat(
      '1234567890'.split('').map(function (d) { return K(d, d, 'Digit' + d); }),
      [K('-', '-', 'Minus'), K('=', '=', 'Equal'), K('⌫', null, 'Backspace', 'k-w2 k-fn', 'bs')]
    ),
    [K('Tab', null, 'Tab', 'k-w15 k-fn')].concat(
      letters('qwertyuiop'),
      [K('[', '[', 'BracketLeft'), K(']', ']', 'BracketRight'), K('\\', '\\', 'Backslash', 'k-w15')]
    ),
    [K('Caps', null, 'CapsLock', 'k-w175 k-fn')].concat(
      letters('asdfghjkl'),
      [K(';', ';', 'Semicolon'), K("'", "'", 'Quote'), K('Enter', null, 'Enter', 'k-w225 k-fn')]
    ),
    [K('Shift', null, 'ShiftLeft', 'k-w225 k-fn')].concat(
      letters('zxcvbnm'),
      [K(',', ',', 'Comma'), K('.', '.', 'Period'), K('/', '/', 'Slash'), K('Shift', null, 'ShiftRight', 'k-w275 k-fn')]
    ),
    [K('Ctrl', null, 'ControlLeft', 'k-w125 k-fn'), K('Alt', null, 'AltLeft', 'k-w125 k-fn'),
     K('Space', ' ', 'Space', 'kbd3d-space'), K('Alt', null, 'AltRight', 'k-w125 k-fn'),
     K('Ctrl', null, 'ControlRight', 'k-w125 k-fn')],
  ];

  function keyBtn(key) {
    var ko = key.k && KO[key.k];
    var attrs = ' data-code="' + key.c + '"';
    if (key.k != null) attrs += " data-key=\"" + (key.k === '"' ? '&quot;' : key.k) + "\"";
    if (key.act) attrs += ' data-act="' + key.act + '"';
    var inner = ko
      ? '<span class="k-ko">' + ko + '</span><span class="k-en">' + key.l + '</span>'
      : '<span class="k-en">' + key.l + '</span>';
    return '<button type="button" class="kbd3d-key ' + key.w + '"' + attrs + '>' + inner + '</button>';
  }
  var rowsHtml = ROWS.map(function (row) {
    return '<div class="kbd3d-row">' + row.map(keyBtn).join('') + '</div>';
  }).join('');
  var keyboardHtml =
    '<div class="kbd3d">' +
      '<input class="cui-input kbd3d-input" placeholder="키보드를 두드리거나 키캡을 클릭하세요">' +
      '<div class="kbd3d-board">' + rowsHtml + '</div>' +
    '</div>';

  // ── 원근 기하: tiltDeg → 스트립 폭 보간(scaleTop) + 세로 압축(squash) ──
  function geom(api) {
    var deg = api.state.tiltDeg == null ? 22 : api.state.tiltDeg;
    var rad = deg * Math.PI / 180;
    var W = api.src.width, H = api.src.height;
    var scaleTop = 1 - Math.sin(rad) * 0.55; // 위쪽이 좁아지는 사다리꼴
    var squash = 1 - Math.sin(rad) * 0.30;   // 세로 압축
    return {
      W: W, H: H, scaleTop: scaleTop, squash: squash,
      cx: api.fx.width / 2,
      topY: (api.fx.height - H * squash) / 2,
    };
  }
  function scaleAt(g, y) { return g.scaleTop + (1 - g.scaleTop) * (y / g.H); }
  /** 로컬 좌표 → 원근 적용된 fx 좌표 */
  function project(g, x, y) {
    var s = scaleAt(g, y);
    return { x: g.cx + (x - g.W / 2) * s, y: g.topY + y * g.squash, s: s };
  }
  /** fx 좌표 → 원근 역변환 → 로컬 좌표 */
  function unproject(g, px, py) {
    var y = (py - g.topY) / g.squash;
    var s = scaleAt(g, y);
    return { x: g.W / 2 + (px - g.cx) / s, y: y };
  }

  function mount(el) {
    injectStyle();

    var inputEl = null; // create 이후 할당 (onHit 클로저에서 참조)

    // ── 인스턴스 생성 ──
    var kb = CanvasUI.create({
      mount: el,
      html: keyboardHtml,
      width: 760,
      height: 440,

      // 리플 진행 (effect 앞에 호출됨)
      onFrame: function (t, api) {
        var ripples = api.state.ripples || [];
        for (var i = 0; i < ripples.length; i++) {
          var r = ripples[i];
          r.r += 5 + r.r * 0.04;
          r.alpha *= 0.93;
        }
        api.state.ripples = ripples.filter(function (r) { return r.alpha > 0.02; });
      },

      // 버퍼 패턴: src 촬영본을 가로 스트립으로 잘라 원근 사다리꼴로 복사 + 리플
      effect: function (ctx, src, t, api) {
        var g = geom(api);

        // 바닥 그림자
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.beginPath();
        ctx.ellipse(g.cx, g.topY + g.H * g.squash + 14, g.W * 0.46, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // 원근 스트립 (2D 변환 유사 3D)
        var STRIP = 3;
        for (var sy = 0; sy < g.H; sy += STRIP) {
          var h = Math.min(STRIP, g.H - sy);
          var s = scaleAt(g, sy + h / 2);
          var dw = g.W * s;
          ctx.drawImage(src, 0, sy, g.W, h,
            g.cx - dw / 2, g.topY + sy * g.squash, dw, h * g.squash + 1);
        }

        // 잉크 리플: 키 로컬 좌표를 같은 원근으로 매핑해 타원 링으로
        var ripples = api.state.ripples || [];
        var color = api.state.rippleColor || '#6366f1';
        for (var i = 0; i < ripples.length; i++) {
          var r = ripples[i];
          var p = project(g, r.x, r.y);
          var rx = r.r * p.s, ry = r.r * p.s * g.squash;
          ctx.globalAlpha = r.alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1, 4 * r.alpha);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = r.alpha * 0.15;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      },

      // effect가 좌표를 변형하므로 역변환 후 api.hit()으로 직접 판정
      onHit: function (el2, ev, api) {
        var rect = api.fx.getBoundingClientRect();
        var px = (ev.clientX - rect.left) * (api.fx.width / rect.width);
        var py = (ev.clientY - rect.top) * (api.fx.height / rect.height);
        var local = unproject(geom(api), px, py);
        var target = api.hit(local.x, local.y);

        if (target) {
          var btn = target.closest('button[data-code]');
          if (btn && api.root.contains(btn)) {
            flash(btn);
            btn.click(); // → 아래 위임 click 핸들러가 data-key를 input에 삽입 + 리플
            return true;
          }
          if (target === inputEl) {
            inputEl.focus();
            try {
              var len = inputEl.value.length;
              inputEl.setSelectionRange(len, len);
            } catch (ignored) { /* 선택 미지원 타입 */ }
            return true;
          }
        }
        if (api.root.contains(document.activeElement)) document.activeElement.blur();
        return true; // 기본 포워딩(미보정 좌표) 생략
      },
    });

    kb.state.tiltDeg = 22;
    kb.state.rippleColor = '#6366f1';
    kb.state.ripples = [];

    inputEl = kb.root.querySelector('.kbd3d-input');

    // ── 키 로컬 중심 좌표 (offset 누적) → 리플 생성 ──
    function spawnRippleAt(btn) {
      var l = 0, t = 0, n = btn;
      while (n && n !== kb.root) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent; }
      kb.state.ripples.push({
        x: l + btn.offsetWidth / 2,
        y: t + btn.offsetHeight / 2,
        r: 8, alpha: 0.85,
      });
      if (kb.state.ripples.length > 24) kb.state.ripples.shift();
    }

    // ── 키캡 눌림 애니메이션 (.cui-active 잠깐 토글) ──
    function flash(btn) {
      btn.classList.add('cui-active');
      setTimeout(function () { btn.classList.remove('cui-active'); }, 130);
    }

    // ── 클릭(마우스/폴백 공통): data-key 삽입 / data-act 처리 + 리플 ──
    kb.root.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-code]') : null;
      if (!btn) return;
      if (btn.dataset.act === 'bs') inputEl.value = inputEl.value.slice(0, -1);
      else if (btn.dataset.key != null) inputEl.value += btn.dataset.key;
      // 그 외(Fn·모디파이어)는 눌림 연출만
      inputEl.focus();
      try {
        var len = inputEl.value.length;
        inputEl.setSelectionRange(len, len);
      } catch (ignored) { /* 무시 */ }
      spawnRippleAt(btn);
    });

    // ── 물리 키보드: e.code ↔ data-code 직접 매칭(한글 IME에서도 동작) ──
    function onKeydown(e) {
      if (e.metaKey) return;
      var tag = e.target.tagName;
      if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && e.target !== inputEl) return; // 페이지 컨트롤 입력은 통과
      var btn = kb.root.querySelector('[data-code="' + e.code + '"]');
      if (!btn) return;
      flash(btn);
      spawnRippleAt(btn);
      if (document.activeElement !== inputEl && !e.ctrlKey && !e.altKey) {
        if (btn.dataset.key === ' ') { e.preventDefault(); inputEl.value += ' '; } // 페이지 스크롤 방지 + 직접 삽입
        if (btn.dataset.key != null || btn.dataset.act) {
          inputEl.focus(); // 이후 문자 입력·한글 IME는 브라우저가 처리 → 다음 프레임 촬영에 반영
        }
      }
    }
    window.addEventListener('keydown', onKeydown);

    // 라우팅 이탈 시 셸이 destroy()를 호출 → window 리스너도 함께 해제
    var origDestroy = kb.destroy.bind(kb);
    kb.destroy = function () {
      window.removeEventListener('keydown', onKeydown);
      origDestroy();
    };

    return kb;
  }

  function knobs(el, api) {
    var wrap = document.createElement('div');
    wrap.className = 'kbd3d-knobs';
    wrap.innerHTML =
      '<div class="field">' +
        '<label class="cui-label" for="kbd3d-tilt">기울기 각도: <span id="kbd3d-tilt-val">22</span>°</label>' +
        '<input type="range" id="kbd3d-tilt" min="0" max="40" step="1" value="22">' +
      '</div>' +
      '<div class="field">' +
        '<label class="cui-label" for="kbd3d-ripple-color">리플 색</label>' +
        '<input type="color" id="kbd3d-ripple-color" value="#6366f1">' +
      '</div>';
    el.appendChild(wrap);

    var tilt = wrap.querySelector('#kbd3d-tilt');
    var tiltVal = wrap.querySelector('#kbd3d-tilt-val');
    tilt.addEventListener('input', function () {
      api.state.tiltDeg = Number(tilt.value);
      tiltVal.textContent = tilt.value;
    });
    wrap.querySelector('#kbd3d-ripple-color').addEventListener('input', function (e) {
      api.state.rippleColor = e.target.value;
    });
  }

  var FULL_CODE = [
    "const kb = CanvasUI.create({",
    "  mount: el,",
    "  html: keyboardHtml, // .kbd3d 마크업 — input + button[data-key] 키캡",
    "  width: 760, height: 440,",
    "  onFrame: (t, api) => {",
    "    // 리플 진행 (물리 갱신은 effect 앞, onFrame에서)",
    "    api.state.ripples = (api.state.ripples || []).filter(r => r.alpha > 0.02);",
    "    api.state.ripples.forEach(r => { r.r += 5 + r.r * 0.04; r.alpha *= 0.93; });",
    "  },",
    "  effect: (ctx, src, t, api) => {",
    "    // 소스 canvas를 가로 스트립으로 잘라 폭을 보간 → 원근 사다리꼴 (유사 3D)",
    "    const g = geom(api); // tiltDeg → scaleTop·squash·중심 좌표",
    "    for (let sy = 0; sy < g.H; sy += 3) {",
    "      const s = g.scaleTop + (1 - g.scaleTop) * (sy / g.H);",
    "      ctx.drawImage(src, 0, sy, g.W, 3,",
    "        g.cx - g.W * s / 2, g.topY + sy * g.squash, g.W * s, 3 * g.squash + 1);",
    "    }",
    "    // 리플은 같은 원근 매핑으로 타원 링을 그린다",
    "  },",
    "  onHit: (el, ev, api) => {",
    "    // effect가 좌표를 변형하므로 역변환 후 api.hit()으로 직접 판정",
    "    const local = unproject(api, ev);          // fx 좌표 → 기울기 역변환 → 로컬",
    "    const t2 = api.hit(local.x, local.y);",
    "    const btn = t2 && t2.closest('button[data-key]');",
    "    if (btn) { flash(btn); btn.click(); }       // click → data-key 문자를 input에 삽입",
    "    return true; // 기본 포워딩(미보정 좌표) 생략",
    "  },",
    "});",
    "kb.state.tiltDeg = 22;        // 커스텀: 기울기 각도 (0~40)",
    "kb.state.rippleColor = '#6366f1'; // 커스텀: 리플 색",
  ].join('\n');

  window.CUIDocs.register({
    id: ID,
    name: '3D 키보드',
    emoji: '⌨️',
    section: 'components',
    oneLiner: 'F1~F12 컴팩트 키보드를 원근으로 눕히고 잉크 리플이 퍼짐',
    code: FULL_CODE,
    mount: mount,
    knobs: knobs,
  });
})();
