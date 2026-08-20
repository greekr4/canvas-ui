/**
 * three-wasd — three.js 연동 예제: WASD로 걸어다니는 3D 공간
 *
 * 메커니즘:
 *  - 3D 룸의 모니터 화면 = layoutsubtree 소스 canvas의 자식인 살아있는 DOM 패널
 *    (시계·LIVE 배지·플레이어 좌표가 매 프레임 갱신 → paint 촬영 → CanvasTexture)
 *  - WASD 이동 + 마우스 드래그 시점 회전 (1인칭)
 *  - three.js는 vendor/three.min.js(UMD, CDN 아님), 미지원 시 요구 사항 안내만 표시
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-three-wasd';
  var W = 380, H = 340; // 모니터 DOM 논리 해상도
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.tw-gl { display: block; border-radius: 12px; background: #0b0d14; max-width: 100%; cursor: grab; }',
      '.tw-gl.tw-drag { cursor: grabbing; }',
      '.tw-src-wrap { position: absolute; left: 0; top: 0; z-index: -1; overflow: hidden; }',
      '.tw-wrap { position: relative; }',
      '.tw-caption { margin: 8px 0 0; font-size: 12px; color: var(--cui-muted, #a1a1aa); }',
      '.tw-error { display: none; margin-top: 8px; padding: 10px 12px; background: #3a1214; color: #ffb4b4;',
      '  border-radius: 8px; font-size: 12px; white-space: pre-wrap; font-family: monospace; }',
      /* 모니터 속 DOM 패널 */
      '.tw-panel { width: ' + W + 'px; height: ' + H + 'px; box-sizing: border-box; padding: 18px;',
      '  background: linear-gradient(160deg, #101728 0%, #0a0e18 100%); color: #e8ecf8;',
      '  font-family: var(--cui-font, system-ui, sans-serif); border-radius: 6px; }',
      '.tw-panel h5 { margin: 0 0 10px; font-size: 15px; display: flex; align-items: center; gap: 8px; }',
      '.tw-live { font-size: 10px; font-weight: 700; letter-spacing: 1px; padding: 2px 8px;',
      '  border-radius: 999px; background: #ef4444; animation: tw-pulse 1.2s ease-in-out infinite; }',
      '@keyframes tw-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }',
      '.tw-stat { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 10px;',
      '  background: rgba(255,255,255,0.06); border-radius: 8px; margin-bottom: 6px;',
      '  font-variant-numeric: tabular-nums; }',
      '.tw-stat b { color: #93c5fd; font-weight: 600; }',
      /* 모니터 속 폼 컨트롤 (클릭/타이핑은 레이캐스트 포워딩으로) */
      '.tw-input { width: 100%; box-sizing: border-box; padding: 8px 10px; margin-top: 4px; font-size: 13px;',
      '  color: #e8ecf8; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);',
      '  border-radius: 8px; outline: none; caret-color: #fff; font-family: inherit; }',
      '.tw-input:focus { border-color: #6366f1; background: rgba(99,102,241,0.15);',
      '  box-shadow: 0 0 0 3px rgba(99,102,241,0.25); }',
      '.tw-row { display: flex; gap: 12px; align-items: center; margin-top: 9px; }',
      '.tw-btn { padding: 7px 12px; font-size: 12px; font-weight: 600; color: #fff; background: #6366f1;',
      '  border: 0; border-radius: 8px; cursor: pointer; font-family: inherit; }',
      '.tw-btn:hover, .tw-btn.cui-hover { filter: brightness(1.25); }',
      '.tw-btn.cui-active { transform: scale(0.96); }',
      '.tw-check { font-size: 12px; display: flex; gap: 6px; align-items: center; color: #cdd3e8; }',
      '.tw-check input { accent-color: #6366f1; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  var PANEL_HTML =
    '<div class="tw-panel">' +
    '  <h5>상황판 <span class="tw-live">LIVE</span></h5>' +
    '  <div class="tw-stat"><span>현재 시각</span><b class="tw-clock">--:--:--</b></div>' +
    '  <div class="tw-stat"><span>플레이어 위치</span><b class="tw-pos">x 0.0 · z 0.0</b></div>' +
    '  <div class="tw-stat"><span>바라보는 방향</span><b class="tw-yaw">0°</b></div>' +
    '  <div class="tw-stat"><span>이동 키</span><b class="tw-keys">-</b></div>' +
    '  <input class="tw-input" placeholder="모니터를 클릭해 메모 입력 (한글 OK)">' +
    '  <div class="tw-row">' +
    '    <button type="button" class="tw-btn">카운트 +1 · <b class="tw-count">0</b></button>' +
    '    <label class="tw-check"><input type="checkbox" class="tw-cb" checked> 보라 조명</label>' +
    '  </div>' +
    '</div>';

  var CODE = [
    "// 1) 모니터 화면 = layoutsubtree 소스 canvas의 자식 DOM → paint 촬영 → CanvasTexture",
    "src.addEventListener('paint', () => {",
    "  sctx.reset(); sctx.drawElementImage(panel, 0, 0);",
    "  screenTexture.needsUpdate = true;",
    "});",
    "",
    "// 2) WASD: yaw 기준 전후좌우 이동, 드래그: 시점 회전",
    "const f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);",
    "const r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);",
    "camera.position.x += (Math.sin(yaw) * f + Math.cos(yaw) * r) * speed;",
    "camera.position.z += (-Math.cos(yaw) * f + Math.sin(yaw) * r) * speed;",
    "",
    "// 3) DOM 패널 텍스트를 매 프레임 갱신 → 3D 속 화면이 '살아있음'",
    "posEl.textContent = `x ${camera.position.x.toFixed(1)} · z ${camera.position.z.toFixed(1)}`;",
    "",
    "// 4) 모니터 클릭 → 레이캐스트 UV → 패널 좌표 → 진짜 DOM에 포워딩",
    "const uv = raycaster.intersectObject(screen)[0]?.uv;",
    "const el = hitTest(uv.x * W, (1 - uv.y) * H);",
    "if (el.matches('input')) el.focus();   // 이후 타이핑·한글 IME는 브라우저가 처리",
    "else el.closest('button, label')?.click(); // 체크박스 → 3D 조명 on/off",
  ].join('\n');

  function mount(el) {
    var wrap = document.createElement('div');
    wrap.className = 'tw-wrap';
    el.appendChild(wrap);

    var caption = document.createElement('p');
    caption.className = 'tw-caption';
    caption.textContent = 'WASD 이동 · 마우스 드래그로 시점 회전 — 모니터 속 상황판은 살아있는 DOM';
    var errBox = document.createElement('p');
    errBox.className = 'tw-error';

    // ── 소스 canvas + 패널 DOM ──
    var srcWrap = document.createElement('div');
    srcWrap.className = 'tw-src-wrap';
    var src = document.createElement('canvas');
    src.setAttribute('layoutsubtree', '');
    src.width = W; src.height = H;
    src.innerHTML = PANEL_HTML;
    srcWrap.appendChild(src);
    wrap.appendChild(srcWrap);
    var sctx = src.getContext('2d');
    var panel = src.querySelector('.tw-panel');

    var drawFn = sctx && ['drawElementImage', 'drawElement'].filter(function (n) {
      return typeof sctx[n] === 'function';
    })[0];

    var clockTimer = setInterval(function () {
      panel.querySelector('.tw-clock').textContent = new Date().toLocaleTimeString('ko-KR');
    }, 1000);

    function fallback(reason) { // 미지원: 안내만 (DOM 폴백 없음)
      srcWrap.remove();
      clearInterval(clockTimer);
      caption.textContent = reason + ' — Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.';
      wrap.appendChild(caption);
      return { destroy: function () { wrap.remove(); } };
    }
    if (!drawFn) return fallback('drawElementImage 미지원');
    if (!window.THREE) return fallback('three.js(vendor) 로드 실패');

    var THREE = window.THREE;
    var renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch (e) { return fallback('WebGL 초기화 실패'); }

    var FW = 820, FH = 500;
    renderer.setSize(FW, FH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'tw-gl';
    wrap.appendChild(renderer.domElement);
    wrap.appendChild(caption);
    wrap.appendChild(errBox);

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b0d14, 8, 26);
    var camera = new THREE.PerspectiveCamera(58, FW / FH, 0.1, 60);
    camera.position.set(0, 1.5, 4);

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    var key = new THREE.DirectionalLight(0xffffff, 0.7);
    key.position.set(3, 6, 2);
    scene.add(key);
    var accent = new THREE.PointLight(0x6366f1, 1.1, 14);
    accent.position.set(0, 2.6, -3);
    scene.add(accent);

    // 바닥
    scene.add(new THREE.GridHelper(40, 40, 0x334, 0x223));
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x11131c, roughness: 0.95 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    scene.add(floor);

    // 모니터: 스탠드 + 살아있는 DOM 스크린
    var stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.0, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x2a2c38, metalness: 0.7, roughness: 0.3 })
    );
    stand.position.set(0, 0.5, -3);
    scene.add(stand);
    var bezel = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.94, 0.08), // 380x340 비율에 맞춤
      new THREE.MeshStandardMaterial({ color: 0x14151c, metalness: 0.6, roughness: 0.35 })
    );
    bezel.position.set(0, 1.85, -3);
    scene.add(bezel);

    var texture = new THREE.CanvasTexture(src);
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearFilter; // NPOT → 밉맵 금지
    texture.generateMipmaps = false;
    var screen = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 2.0 * H / W), // DOM 비율 그대로
      new THREE.MeshBasicMaterial({ map: texture })
    );
    screen.position.set(0, 1.85, -2.955);
    scene.add(screen);

    // 공간감용 기둥들
    var pillarMat = new THREE.MeshStandardMaterial({ color: 0x1d2340, roughness: 0.6 });
    [[-4, -5], [4, -5], [-4, 2], [4, 2]].forEach(function (p) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, 0.5), pillarMat);
      m.position.set(p[0], 1.6, p[1]);
      scene.add(m);
    });

    // ── 촬영 (paint 이벤트 모델) ──
    var lastErrs = null, captureOk = false, paintSeen = false, failStreak = 0, errShown = false;
    function snap() {
      if (sctx.reset) sctx.reset(); else sctx.clearRect(0, 0, W, H);
      var tries = [
        function () { sctx[drawFn](panel, 0, 0); },
        function () { sctx[drawFn](panel, 0, 0, W, H); },
        function () { sctx[drawFn](panel); },
      ];
      var errs = [];
      for (var i = 0; i < tries.length; i++) {
        try { tries[i](); captureOk = true; failStreak = 0; texture.needsUpdate = true; return; }
        catch (e) { errs.push(e.name + ': ' + e.message); }
      }
      lastErrs = errs; failStreak++;
      if (!captureOk && failStreak === 90 && !errShown) {
        errShown = true;
        errBox.style.display = 'block';
        errBox.textContent = '⚠️ 촬영 계속 실패 — 이 메시지를 그대로 알려주세요.\n' + lastErrs.join('\n');
      }
    }
    src.addEventListener('paint', function () { paintSeen = true; snap(); });

    // ── 조작: WASD + 드래그 시점 ──
    var keys = {}, yaw = 0, pitch = -0.05;
    var dragging = false, lastX = 0, lastY = 0;
    function isTyping() {
      var a = document.activeElement;
      return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
    }
    function onKey(down) {
      return function (e) {
        if (isTyping()) return;
        var k = e.key.toLowerCase();
        if ('wasd'.indexOf(k) >= 0) { keys[k] = down; }
      };
    }
    var onKeydown = onKey(true), onKeyup = onKey(false);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('keyup', onKeyup);

    // ── 모니터 상호작용: 레이캐스트 UV → 패널 로컬 좌표 → DOM 포워딩 ──
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    function screenHit(e) {
      var r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObject(screen);
      if (!hits.length) return null;
      return { x: hits[0].uv.x * W, y: (1 - hits[0].uv.y) * H };
    }
    function localRect(node) { // panel 기준 offset 누적
      var l = 0, t = 0, cur = node;
      while (cur && cur !== panel) { l += cur.offsetLeft; t += cur.offsetTop; cur = cur.offsetParent; }
      return { l: l, t: t, r: l + node.offsetWidth, b: t + node.offsetHeight };
    }
    function hitEl(x, y) {
      var els = panel.querySelectorAll('*');
      var best = null, bestDepth = -1;
      for (var i = 0; i < els.length; i++) {
        if (!els[i].offsetWidth) continue;
        var rc = localRect(els[i]);
        if (x >= rc.l && x < rc.r && y >= rc.t && y < rc.b) {
          var d = 0, pnode = els[i];
          while (pnode && pnode !== panel) { d++; pnode = pnode.parentElement; }
          if (d >= bestDepth) { bestDepth = d; best = els[i]; }
        }
      }
      return best;
    }
    var hoverEl = null;
    function setHover(n) {
      if (hoverEl === n) return;
      if (hoverEl) hoverEl.classList.remove('cui-hover');
      hoverEl = n;
      if (hoverEl) hoverEl.classList.add('cui-hover');
    }

    renderer.domElement.addEventListener('pointerdown', function (e) {
      var p = screenHit(e);
      if (p) {
        // 모니터를 클릭 → DOM 포워딩 (드래그 시작 안 함)
        e.preventDefault(); // canvas가 포커스를 뺏지 않게
        var n = hitEl(p.x, p.y);
        var input = n && n.closest('input:not([type="checkbox"])');
        if (input) {
          input.focus({ preventScroll: true });
          try { var len = input.value.length; input.setSelectionRange(len, len); } catch (ig) {}
          return;
        }
        var press = n && n.closest('button, .tw-check');
        if (press) {
          var target = press.classList.contains('tw-check') ? press.querySelector('input') : press;
          press.classList.add('cui-active');
          setTimeout(function () { press.classList.remove('cui-active'); }, 140);
          target.click();
          return;
        }
        if (panel.contains(document.activeElement)) document.activeElement.blur();
        return;
      }
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      renderer.domElement.classList.add('tw-drag');
    });
    function onMove(e) {
      if (dragging) {
        yaw -= (e.clientX - lastX) * 0.004;
        pitch -= (e.clientY - lastY) * 0.003;
        pitch = Math.max(-0.9, Math.min(0.6, pitch));
        lastX = e.clientX; lastY = e.clientY;
        return;
      }
      if (e.target !== renderer.domElement) return;
      var p = screenHit(e);
      var n = p && hitEl(p.x, p.y);
      var interactive = n && (n.closest('input, button, .tw-check'));
      setHover(interactive || null);
      renderer.domElement.style.cursor = interactive
        ? (interactive.closest('input:not([type="checkbox"])') ? 'text' : 'pointer')
        : 'grab';
    }
    function onUp() { dragging = false; renderer.domElement.classList.remove('tw-drag'); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // ── 패널 컨트롤 동작: 버튼 카운터, 체크박스 → 3D 조명 제어 ──
    var countEl = panel.querySelector('.tw-count');
    panel.querySelector('.tw-btn').addEventListener('click', function () {
      countEl.textContent = String(Number(countEl.textContent) + 1);
    });
    panel.querySelector('.tw-cb').addEventListener('change', function (e) {
      accent.visible = e.target.checked; // DOM 체크박스가 3D 씬을 제어
    });

    // ── 루프 ──
    var api;
    var rafId = 0, destroyed = false;
    var posEl = panel.querySelector('.tw-pos');
    var yawEl = panel.querySelector('.tw-yaw');
    var keysEl = panel.querySelector('.tw-keys');

    function frame() {
      if (destroyed) return;
      try {
        if (typeof src.requestPaint === 'function') src.requestPaint();
        if (!paintSeen) snap();

        var speed = api.state.speed;
        var f = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
        var r = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
        if (f || r) {
          var inv = (f && r) ? 0.7071 : 1; // 대각선 정규화
          // 전방 = (-sin(yaw), 0, -cos(yaw)), 우측 = (cos(yaw), 0, -sin(yaw))
          camera.position.x += (-Math.sin(yaw) * f + Math.cos(yaw) * r) * speed * inv;
          camera.position.z += (-Math.cos(yaw) * f + -Math.sin(yaw) * r) * speed * inv;
        }
        // 경계
        camera.position.x = Math.max(-9, Math.min(9, camera.position.x));
        camera.position.z = Math.max(-9, Math.min(9, camera.position.z));
        camera.rotation.set(pitch, yaw, 0, 'YXZ');

        // 살아있는 DOM 갱신 (다음 촬영에 반영)
        posEl.textContent = 'x ' + camera.position.x.toFixed(1) + ' · z ' + camera.position.z.toFixed(1);
        yawEl.textContent = Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360) + '°';
        keysEl.textContent = ['w', 'a', 's', 'd'].filter(function (k) { return keys[k]; }).join(' ').toUpperCase() || '-';

        renderer.render(scene, camera);
      } catch (e) {
        if (!errShown) {
          errShown = true;
          errBox.style.display = 'block';
          errBox.textContent = '⚠️ 렌더 예외 — 이 메시지를 그대로 알려주세요.\n' + e.name + ': ' + e.message;
        }
      }
      rafId = requestAnimationFrame(frame);
    }

    api = {
      state: { speed: 0.09 },
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(rafId);
        clearInterval(clockTimer);
        window.removeEventListener('keydown', onKeydown);
        window.removeEventListener('keyup', onKeyup);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        texture.dispose();
        renderer.dispose();
        wrap.remove();
      },
    };
    rafId = requestAnimationFrame(frame);
    return api;
  }

  function knobs(el, api) {
    if (!api || !api.state) return;
    var label = document.createElement('label');
    label.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13px;color:var(--cui-muted,#a1a1aa);';
    label.textContent = '이동 속도';
    var slider = document.createElement('input');
    slider.type = 'range'; slider.min = '3'; slider.max = '25'; slider.value = '9';
    slider.style.width = '220px';
    slider.addEventListener('input', function () { api.state.speed = Number(slider.value) / 100; });
    label.appendChild(slider);
    el.appendChild(label);
  }

  window.CUIDocs.register({
    id: 'three-wasd',
    section: 'components',
    name: 'three.js 연동 예제',
    emoji: '🕹️',
    oneLiner: 'WASD로 걸어다니는 3D 룸 — 모니터 화면이 살아있는 DOM',
    code: CODE,
    mount: mount,
    knobs: knobs,
  });
})();
