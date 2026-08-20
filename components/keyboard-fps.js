(function () {
  'use strict';

  var ID = 'keyboard-fps';

  // ── 컴포넌트 고유 CSS (중복 주입 가드) ──
  var CSS =
    '.kfps { width: 720px; padding: 24px; background: var(--cui-card);' +
    '        border: 1px solid var(--cui-border); border-radius: var(--cui-radius); }\n' +
    '.kfps-input { margin-bottom: 24px; font-size: 16px; letter-spacing: 1px; }\n' +
    '.kfps-board { display: flex; flex-direction: column; gap: 5px; align-items: center; }\n' +
    '.kfps-row { display: flex; gap: 5px; }\n' +
    '.kfps-key {' +
    '  width: 40px; height: 40px; padding: 0;' +
    '  background: var(--cui-bg); color: var(--cui-fg);' +
    '  border: 1px solid var(--cui-border); border-radius: 8px;' +
    '  font-size: 12px; font-weight: 600; font-family: var(--cui-font);' +
    '  cursor: pointer;' +
    '}\n' +
    /* 실제 :hover는 canvas 위라 안 걸림 → .cui-hover 함께 선언 (코어 규칙) */
    '.kfps-key:hover, .kfps-key.cui-hover { border-color: var(--cui-muted); background: var(--cui-card); }\n' +
    '.kfps-key:active, .kfps-key.cui-active { transform: scale(0.95); }\n' +
    '.kfps-key-fn { font-size: 10px; color: var(--cui-muted); font-weight: 500; }\n' +
    '.kfps-w125 { width: 53px; } .kfps-w15 { width: 65px; } .kfps-w175 { width: 76px; }\n' +
    '.kfps-key-wide { width: 85px; }\n' +
    '.kfps-w225 { width: 96px; } .kfps-w275 { width: 119px; }\n' +
    '.kfps-key-space { width: 260px; }\n' +
    /* 피격 플래시: 클래스 토글 → 다음 프레임 촬영에 자동 반영 */
    '.kfps-key.kfps-hit {' +
    '  background: var(--cui-primary); color: var(--cui-primary-fg);' +
    '  border-color: var(--cui-primary);' +
    '}\n' +
    /* knobs 컨트롤 */
    '.kfps-knobs { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }\n' +
    '.kfps-knob label { display: block; font-size: 13px; color: var(--cui-muted); margin-bottom: 8px; }\n' +
    '.kfps-knob output { color: var(--cui-fg); font-weight: 600; margin-left: 8px; }\n' +
    '.kfps-knob input[type="range"] { width: 100%; accent-color: var(--cui-primary); }\n' +
    '.kfps-knob input[type="color"] {' +
    '  width: 48px; height: 32px; padding: 0; border: 1px solid var(--cui-border);' +
    '  border-radius: 8px; background: var(--cui-bg); cursor: pointer;' +
    '}';

  function injectStyle() {
    if (document.getElementById('cui-style-' + ID)) return;
    var s = document.createElement('style');
    s.id = 'cui-style-' + ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ── 키보드 마크업: F1~F12 포함 컴팩트(75%) 레이아웃 ──
  // data-key가 있으면 명중 시 타이핑, 없으면(Fn·모디파이어) 피격 연출만
  function keyBtn(k, label, extra) {
    var dk = k == null ? '' : ' data-key="' + k + '"';
    return '<button type="button" class="kfps-key ' + (extra || '') + '"' + dk + '>' + label + '</button>';
  }
  function fnKeys(labels, extra) {
    return labels.map(function (l) { return keyBtn(null, l, 'kfps-key-fn ' + (extra || '')); }).join('');
  }
  var rows = [
    keyBtn(null, 'ESC', 'kfps-key-fn') +
      fnKeys(['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12']),
    keyBtn('`', '`') + '1234567890'.split('').map(function (k) { return keyBtn(k, k); }).join('') +
      keyBtn('-', '-') + keyBtn('=', '=') + keyBtn('BS', '⌫', 'kfps-key-wide kfps-key-fn'),
    keyBtn(null, 'TAB', 'kfps-key-fn kfps-w15') +
      'QWERTYUIOP'.split('').map(function (k) { return keyBtn(k, k); }).join('') +
      keyBtn('[', '[') + keyBtn(']', ']') + keyBtn('\\', '\\', 'kfps-w15'),
    keyBtn(null, 'CAPS', 'kfps-key-fn kfps-w175') +
      'ASDFGHJKL'.split('').map(function (k) { return keyBtn(k, k); }).join('') +
      keyBtn(';', ';') + keyBtn("'", "'") + keyBtn(null, 'ENTER', 'kfps-key-fn kfps-w225'),
    keyBtn(null, 'SHIFT', 'kfps-key-fn kfps-w225') +
      'ZXCVBNM'.split('').map(function (k) { return keyBtn(k, k); }).join('') +
      keyBtn(',', ',') + keyBtn('.', '.') + keyBtn('/', '/') +
      keyBtn(null, 'SHIFT', 'kfps-key-fn kfps-w275'),
    keyBtn(null, 'CTRL', 'kfps-key-fn kfps-w125') + keyBtn(null, 'ALT', 'kfps-key-fn kfps-w125') +
      keyBtn('SPACE', 'SPACE', 'kfps-key-space kfps-key-fn') +
      keyBtn(null, 'ALT', 'kfps-key-fn kfps-w125') + keyBtn(null, 'CTRL', 'kfps-key-fn kfps-w125'),
  ];
  var html =
    '<div class="kfps">' +
      '<input class="cui-input kfps-input" placeholder="키캡을 사격해서 타이핑하세요" aria-label="사격 타이핑 결과">' +
      '<div class="kfps-board">' +
        rows.map(function (r) { return '<div class="kfps-row">' + r + '</div>'; }).join('') +
      '</div>' +
    '</div>';

  // ── 발사 로직 ──
  /** fx 버퍼 좌표 계산 (코어와 동일한 방식) */
  function fxCoords(fx, e) {
    var r = fx.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (fx.width / r.width),
      y: (e.clientY - r.top) * (fx.height / r.height),
    };
  }

  /** 진짜 input에 글자 반영 (다음 프레임 촬영에 자동 반영됨) */
  function typeKey(input, key) {
    if (key === 'BS') input.value = input.value.slice(0, -1);
    else if (key === 'SPACE') input.value += ' ';
    else input.value += key;
  }

  /** 좌표 기반 발사 — 클릭·홀드 연사 공용 (쿨다운은 여기서 관리) */
  function fireAt(api, px, py) {
    var s = api.state;
    var now = performance.now();
    if (now - s.lastShot < s.cooldown) return; // 연사 방지 쿨다운
    s.lastShot = now;

    var p = { x: px, y: py };

    // 반동(화면 킥) + 총구 섬광
    s.kick = 1;
    s.kickDir = Math.random() < 0.5 ? -1 : 1;
    s.flash = { x: p.x, y: p.y, t0: now, ang: Math.random() * Math.PI };

    var hitLocal = api.toLocal(p.x, p.y);
    var target = api.hit(hitLocal.x, hitLocal.y);
    var key = target && target.closest ? target.closest('.kfps-key') : null;
    if (!key) return; // 빗나감 — 섬광·반동만

    // 명중: 줌 펀치(1프레임) + 키캡 피격 플래시 + 탄흔 데칼 + 타이핑
    s.punch = 1;
    key.classList.add('kfps-hit');
    setTimeout(function () { key.classList.remove('kfps-hit'); }, 140);

    var local = hitLocal; // root 로컬 좌표로 저장 → DOM에 붙어 보임
    var cracks = [];
    var n = 4 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      cracks.push({ a: (Math.PI * 2 * i) / n + Math.random() * 0.6, len: 6 + Math.random() * 7 });
    }
    s.holes.push({ x: local.x, y: local.y, r: 3.5 + Math.random() * 1.5, cracks: cracks });
    while (s.holes.length > s.maxHoles) s.holes.shift(); // 최근 N개만 누적

    var dk = key.getAttribute('data-key');
    if (dk != null) typeKey(api.root.querySelector('.kfps-input'), dk); // Fn·모디파이어는 연출만
  }

  function fire(el, ev, api) {
    var p = fxCoords(api.fx, ev);
    fireAt(api, p.x, p.y);
  }

  // ── 캔버스 오버레이 드로잉 ──
  function drawHole(ctx, x, y, hole) {
    ctx.save();
    ctx.translate(x, y);
    // 균열 (만화적 탄흔)
    ctx.strokeStyle = 'rgba(9, 9, 11, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (var i = 0; i < hole.cracks.length; i++) {
      var c = hole.cracks[i];
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(c.a) * c.len, Math.sin(c.a) * c.len);
    }
    ctx.stroke();
    // 구멍 본체 + 밝은 테두리
    ctx.fillStyle = '#09090b';
    ctx.beginPath();
    ctx.arc(0, 0, hole.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(250, 250, 250, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, hole.r + 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFlash(ctx, f, now) {
    var age = now - f.t0;
    var DUR = 90;
    if (age >= DUR) return;
    var k = 1 - age / DUR;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(f.ang);
    ctx.globalAlpha = k;
    // 스파이크 4방향 (만화적 섬광)
    ctx.fillStyle = '#fde68a';
    for (var i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(18 + 10 * k, 0);
      ctx.lineTo(0, 3);
      ctx.closePath();
      ctx.fill();
    }
    // 코어
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.arc(0, 0, 5 + 4 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCrosshair(ctx, x, y, color) {
    if (x < 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    var GAP = 5, LEN = 11;
    ctx.beginPath();
    ctx.moveTo(x - GAP - LEN, y); ctx.lineTo(x - GAP, y);
    ctx.moveTo(x + GAP, y); ctx.lineTo(x + GAP + LEN, y);
    ctx.moveTo(x, y - GAP - LEN); ctx.lineTo(x, y - GAP);
    ctx.moveTo(x, y + GAP); ctx.lineTo(x, y + GAP + LEN);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  var CODE = [
    "var app = CanvasUI.create({",
    "  mount: el,",
    "  width: 820, height: 560,",
    "  html: '<div class=\"kfps\">…input + 키보드 마크업…</div>',",
    "",
    "  onHit: function (el, ev, api) {",
    "    // pointerdown = 발사. true 반환 → 기본 포워딩(포커스/클릭) 생략",
    "    fire(el, ev, api);",
    "    return true;",
    "  },",
    "",
    "  onFrame: function (t, api) {",
    "    api.state.kick *= 0.82; // 반동 감쇠",
    "  },",
    "",
    "  effect: function (ctx, src, t, api) {",
    "    var s = api.state;",
    "    // 1) 반동 킥 + 줌 펀치 변환 아래에서 DOM 촬영본·탄흔을 함께 그림",
    "    ctx.save();",
    "    /* translate·rotate·scale → drawImage(src) → drawHole() */",
    "    ctx.restore();",
    "    s.punch = 0; // 줌 펀치는 정확히 1프레임",
    "    // 2) 화면 공간 이펙트: 총구 섬광 + 십자선",
    "  },",
    "});",
    "",
    "// state 초기값: cooldown 120ms, recoil 14px, maxHoles 20, crossColor '#6366f1'",
  ].join('\n');

  window.CUIDocs.register({
    id: ID,
    name: 'FPS 키보드',
    emoji: '🔫',
    section: 'components',
    oneLiner: '키캡을 사격해 반동·탄흔과 함께 진짜 input에 타이핑',
    code: CODE,

    mount: function (el) {
      injectStyle();

      var app = CanvasUI.create({
        mount: el,
        width: 820,
        height: 560,
        html: html,

        onHit: function (hitEl, ev, api) {
          fire(hitEl, ev, api);
          return true; // 기본 포워딩(포커스/클릭) 생략 — 발사가 곧 입력
        },

        onFrame: function (t, api) {
          var s = api.state;
          if (s.holding && s.mx > -900) fireAt(api, s.mx, s.my); // 꾹 누르면 연사
          s.kick *= 0.82; // 반동 감쇠
          if (s.kick < 0.01) s.kick = 0;
        },

        effect: function (ctx, src, t, api) {
          var s = api.state;
          var cx = api.fx.width / 2;
          var cy = api.fx.height / 2;

          // 1) 반동 킥 + 줌 펀치(1프레임 슬로모) 변환 아래에서 DOM 촬영본·탄흔을 함께 그림
          ctx.save();
          var zoom = 1 + s.punch * 0.05;
          ctx.translate(cx, cy + s.kick * s.recoil);
          ctx.rotate(s.kick * 0.006 * s.kickDir);
          ctx.scale(zoom, zoom);
          ctx.translate(-cx, -cy);
          ctx.drawImage(src, api.center.x, api.center.y);
          for (var i = 0; i < s.holes.length; i++) {
            var h = s.holes[i];
            drawHole(ctx, api.center.x + h.x, api.center.y + h.y, h);
          }
          ctx.restore();
          s.punch = 0; // 줌 펀치는 정확히 1프레임만

          // 2) 화면 공간 이펙트 (변환 미적용)
          if (s.flash) drawFlash(ctx, s.flash, t);
          drawCrosshair(ctx, s.mx, s.my, s.crossColor);
        },
      });

      // ── 컴포넌트 상태 초기화 ──
      var st = app.state;
      st.lastShot = -Infinity;
      st.cooldown = 120;   // ms
      st.recoil = 14;      // px
      st.maxHoles = 20;    // 탄흔 최근 N개
      st.crossColor = '#6366f1';
      st.kick = 0; st.kickDir = 1; st.punch = 0;
      st.holes = [];
      st.flash = null;
      st.mx = -999; st.my = -999;
      st.holding = false;

      // 십자선 추적 + 네이티브 커서 숨김
      // (코어 pointermove 리스너가 먼저 커서를 지정하므로, 그 뒤에 등록해 'none'으로 덮는다)
      if (CanvasUI.supported) {
        app.fx.addEventListener('pointermove', function (e) {
          var p = fxCoords(app.fx, e);
          st.mx = p.x; st.my = p.y;
          app.fx.style.cursor = 'none';
        });
        app.fx.addEventListener('pointerleave', function () {
          st.mx = -999; st.my = -999;
          st.holding = false;
        });
        app.fx.addEventListener('pointerdown', function () { st.holding = true; });
        var release = function () { st.holding = false; };
        window.addEventListener('pointerup', release);
        var origDestroy = app.destroy;
        app.destroy = function () {
          window.removeEventListener('pointerup', release);
          origDestroy();
        };
      }

      return app;
    },

    knobs: function (el, api) {
      var st = api.state;

      var wrap = document.createElement('div');
      wrap.className = 'kfps-knobs';
      el.appendChild(wrap);

      function addRange(label, unit, min, max, step, value, apply) {
        var box = document.createElement('div');
        box.className = 'kfps-knob';
        var lab = document.createElement('label');
        lab.textContent = label;
        var out = document.createElement('output');
        out.textContent = value + unit;
        lab.appendChild(out);
        var input = document.createElement('input');
        input.type = 'range';
        input.min = min; input.max = max; input.step = step; input.value = value;
        input.addEventListener('input', function () {
          out.textContent = input.value + unit;
          apply(Number(input.value));
        });
        box.appendChild(lab);
        box.appendChild(input);
        wrap.appendChild(box);
      }

      addRange('연사 쿨다운', 'ms', 60, 400, 10, 120, function (v) { st.cooldown = v; });
      addRange('반동 세기', 'px', 0, 30, 1, 14, function (v) { st.recoil = v; });
      addRange('탄흔 최대 개수', '개', 5, 40, 1, 20, function (v) {
        st.maxHoles = v;
        while (st.holes.length > v) st.holes.shift();
      });

      var colorBox = document.createElement('div');
      colorBox.className = 'kfps-knob';
      var colorLab = document.createElement('label');
      colorLab.textContent = '십자선 색상';
      var colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = '#6366f1';
      colorInput.addEventListener('input', function (e) {
        st.crossColor = e.target.value;
      });
      colorBox.appendChild(colorLab);
      colorBox.appendChild(colorInput);
      wrap.appendChild(colorBox);
    },
  });
})();
