/**
 * phone-3d — three.js 폰 속에서 실행되는 진짜 모바일 앱
 *
 * 메커니즘:
 *  - 앱 UI(홈 → 회원가입 폼 → 완료)는 layoutsubtree 소스 canvas의 자식인 진짜 DOM
 *  - 촬영은 소스 canvas의 paint 이벤트 안에서만(No cached paint record 회피),
 *    rAF에서는 requestPaint 요청만 → THREE.CanvasTexture로 폰 스크린에 입힘
 *  - 입력: 레이캐스트로 스크린 UV → 앱 로컬 좌표 → hit-test → 진짜 요소에
 *    focus/click 포워딩. 이후 키보드·한글 IME는 브라우저가 처리
 *  - 빈 공간 드래그로 폰 회전. three.js는 vendor/three.min.js(UMD, CDN 아님)
 *  - 미지원 시 요구 사항 안내만 표시 (Chromium 146+ 플래그 필요)
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-phone-3d';
  var W = 360, H = 720; // 앱 화면 논리 해상도
  var CSS =
    '.p3-wrap { position: relative; }' +
    '.p3-gl { display: block; border-radius: 12px; background: radial-gradient(ellipse at 50% 30%, #171a26 0%, #0b0d14 70%); max-width: 100%; cursor: grab; }' +
    '.p3-gl.p3-drag { cursor: grabbing; }' +
    '.p3-src-wrap { position: absolute; left: 0; top: 0; z-index: -1; overflow: hidden; }' +
    '.p3-caption { margin: 8px 0 0; font-size: 12px; color: var(--cui-muted, #a1a1aa); }' +
    '.p3-error { display: none; margin-top: 8px; padding: 10px 12px; background: #3a1214; color: #ffb4b4;' +
    '  border-radius: 8px; font-size: 12px; white-space: pre-wrap; font-family: monospace; }' +
    /* ── 앱 UI ── */
    '.p3-app { width: ' + W + 'px; height: ' + H + 'px; border-radius: 30px; overflow: hidden; position: relative;' +
    '  background: linear-gradient(165deg, #1d2340 0%, #10121d 55%, #0b0d14 100%);' +
    '  color: #f4f5fa; font-family: var(--cui-font, "Pretendard","Apple SD Gothic Neo",system-ui,sans-serif); }' +
    '.p3-status { display: flex; justify-content: space-between; padding: 14px 22px 6px; font-size: 14px; font-weight: 600; }' +
    '.p3-screen { position: absolute; inset: 0; padding-top: 44px; display: none; }' +
    '.p3-screen.p3-on { display: block; }' +
    /* 홈 */
    '.p3-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px 6px; padding: 26px 20px; }' +
    '.p3-icon { text-align: center; font-size: 11px; color: #cfd3e4; }' +
    '.p3-icon .p3-glyph { width: 58px; height: 58px; margin: 0 auto 6px; border-radius: 15px; display: flex;' +
    '  align-items: center; justify-content: center; font-size: 27px; background: rgba(255,255,255,0.09);' +
    '  border: 1px solid rgba(255,255,255,0.12); }' +
    '.p3-icon[data-nav] .p3-glyph { background: linear-gradient(150deg, var(--cui-primary, #6366f1), #8b5cf6); }' +
    '.p3-icon.cui-hover .p3-glyph, .p3-icon:hover .p3-glyph { transform: scale(1.08); }' +
    '.p3-dock { position: absolute; left: 14px; right: 14px; bottom: 14px; display: flex; justify-content: space-around;' +
    '  padding: 10px 0; border-radius: 22px; background: rgba(255,255,255,0.07); font-size: 26px; }' +
    /* 폼 */
    '.p3-head { display: flex; align-items: center; gap: 8px; padding: 8px 16px 14px; font-size: 17px; font-weight: 700; }' +
    '.p3-back { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.16);' +
    '  background: rgba(255,255,255,0.07); color: #f4f5fa; font-size: 16px; cursor: pointer; }' +
    '.p3-back.cui-hover, .p3-back:hover { background: rgba(255,255,255,0.16); }' +
    '.p3-form { padding: 4px 22px; display: flex; flex-direction: column; gap: 13px; }' +
    '.p3-form label { font-size: 12px; color: #aab0c6; }' +
    '.p3-form input { width: 100%; box-sizing: border-box; padding: 13px 14px; margin-top: 5px; font-size: 15px;' +
    '  color: #f4f5fa; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16);' +
    '  border-radius: 12px; outline: none; caret-color: #fff; font-family: inherit; }' +
    '.p3-form input::placeholder { color: #6d7390; }' +
    '.p3-form input:focus { border-color: var(--cui-primary, #6366f1); background: rgba(99,102,241,0.14);' +
    '  box-shadow: 0 0 0 3px rgba(99,102,241,0.25); }' +
    '.p3-err { min-height: 16px; font-size: 12px; color: #f87171; margin: 0; }' +
    '.p3-cta { padding: 14px; font-size: 16px; font-weight: 700; color: #fff; border: 0; border-radius: 13px;' +
    '  background: linear-gradient(150deg, var(--cui-primary, #6366f1), #8b5cf6); cursor: pointer; }' +
    '.p3-cta.cui-hover, .p3-cta:hover { filter: brightness(1.15); }' +
    '.p3-cta.cui-active { transform: scale(0.97); }' +
    /* 완료 */
    '.p3-done { text-align: center; padding-top: 130px; }' +
    '.p3-done .p3-check { width: 92px; height: 92px; margin: 0 auto 18px; border-radius: 50%; font-size: 44px;' +
    '  display: flex; align-items: center; justify-content: center; color: #fff;' +
    '  background: linear-gradient(150deg, #22c55e, #4ade80); }' +
    '.p3-done h3 { margin: 0 0 8px; font-size: 21px; }' +
    '.p3-done p { margin: 0 0 26px; font-size: 14px; color: #aab0c6; }' +
    /* 폴백(앱 DOM 직접 표시) */
    '.p3-dom-fallback .p3-src-wrap { position: static; z-index: auto; }';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  var APP_HTML =
    '<div class="p3-app">' +
    '  <div class="p3-status"><span class="p3-clock">--:--</span><span>&#128246; &#128267; 87%</span></div>' +
    '  <div class="p3-screen p3-on" data-screen="home">' +
    '    <div class="p3-grid">' +
    '      <div class="p3-icon" data-nav="app"><div class="p3-glyph">&#9997;&#65039;</div>회원가입</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#128247;</div>사진</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#127925;</div>음악</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#128197;</div>달력</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#9729;&#65039;</div>날씨</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#128172;</div>메시지</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#127918;</div>게임</div>' +
    '      <div class="p3-icon"><div class="p3-glyph">&#9881;&#65039;</div>설정</div>' +
    '    </div>' +
    '    <div class="p3-dock"><span>&#128222;</span><span>&#127760;</span><span>&#128231;</span><span>&#128248;</span></div>' +
    '  </div>' +
    '  <div class="p3-screen" data-screen="app">' +
    '    <div class="p3-head"><button class="p3-back" data-nav="home">&#8592;</button>회원가입</div>' +
    '    <div class="p3-form">' +
    '      <label>이름<input class="p3-name" placeholder="홍길동" autocomplete="off"></label>' +
    '      <label>이메일<input class="p3-email" placeholder="you@example.com" autocomplete="off"></label>' +
    '      <label>비밀번호<input class="p3-pw" type="password" placeholder="6자 이상"></label>' +
    '      <p class="p3-err"></p>' +
    '      <button class="p3-cta">가입하기</button>' +
    '    </div>' +
    '  </div>' +
    '  <div class="p3-screen" data-screen="done">' +
    '    <div class="p3-done">' +
    '      <div class="p3-check">&#10003;</div>' +
    '      <h3>가입 완료!</h3><p class="p3-hello"></p>' +
    '      <button class="p3-cta" data-nav="home" style="width:200px">처음으로</button>' +
    '    </div>' +
    '  </div>' +
    '</div>';

  var CODE = [
    "// 1) 앱 DOM은 layoutsubtree 소스 canvas의 자식",
    "// 2) 촬영은 paint 이벤트 안에서만 → CanvasTexture로 폰 스크린에",
    "src.addEventListener('paint', function () {",
    "  sctx.reset();",
    "  sctx.drawElementImage(appRoot, 0, 0);",
    "  screenTexture.needsUpdate = true;",
    "});",
    "function frame() { src.requestPaint(); renderer.render(scene, camera); }",
    "",
    "// 3) 입력 포워딩: 레이캐스트 UV → 앱 좌표 → 진짜 요소 focus/click",
    "raycaster.setFromCamera(pointer, camera);",
    "var hitUv = raycaster.intersectObject(screenMesh)[0].uv;",
    "var el = hitTest(hitUv.x * 360, (1 - hitUv.y) * 720);",
    "if (el.tagName === 'INPUT') el.focus({ preventScroll: true }); // IME는 브라우저가 처리",
    "else el.closest('button,[data-nav]').click();",
  ].join('\n');

  function mount(el) {
    ensureStyle();
    var wrap = document.createElement('div');
    wrap.className = 'p3-wrap';
    el.appendChild(wrap);

    var errBox = document.createElement('p');
    errBox.className = 'p3-error';
    var caption = document.createElement('p');
    caption.className = 'p3-caption';
    caption.textContent = '앱 아이콘을 클릭해 실행하고 폼에 직접 타이핑(한글 OK) · 빈 공간 드래그로 폰 회전';

    // ── 소스 canvas + 앱 DOM ──
    var srcWrap = document.createElement('div');
    srcWrap.className = 'p3-src-wrap';
    var src = document.createElement('canvas');
    src.setAttribute('layoutsubtree', '');
    src.width = W; src.height = H;
    src.innerHTML = APP_HTML;
    srcWrap.appendChild(src);
    wrap.appendChild(srcWrap);
    var sctx = src.getContext('2d');
    var appRoot = src.querySelector('.p3-app');

    var drawFn = null;
    if (sctx) {
      drawFn = ['drawElementImage', 'drawElement'].filter(function (n) {
        return typeof sctx[n] === 'function';
      })[0] || null;
    }

    // ── 앱 로직 (3D/폴백 공통 — 진짜 DOM 이벤트로 동작) ──
    function show(name) {
      var screens = appRoot.querySelectorAll('.p3-screen');
      for (var i = 0; i < screens.length; i++) {
        screens[i].classList.toggle('p3-on', screens[i].getAttribute('data-screen') === name);
      }
    }
    appRoot.addEventListener('click', function (e) {
      var nav = e.target.closest('[data-nav]');
      if (nav) {
        show(nav.getAttribute('data-nav'));
        return;
      }
      var cta = e.target.closest('.p3-cta');
      if (cta && !cta.hasAttribute('data-nav')) {
        var name = appRoot.querySelector('.p3-name').value.trim();
        var email = appRoot.querySelector('.p3-email').value.trim();
        var pw = appRoot.querySelector('.p3-pw').value;
        var err = appRoot.querySelector('.p3-err');
        if (name.length < 2) { err.textContent = '이름을 2자 이상 입력하세요.'; return; }
        if (email.indexOf('@') < 1) { err.textContent = '이메일 형식을 확인하세요.'; return; }
        if (pw.length < 6) { err.textContent = '비밀번호는 6자 이상이어야 합니다.'; return; }
        err.textContent = '';
        appRoot.querySelector('.p3-hello').textContent = name + '님, 환영합니다.';
        show('done');
      }
    });
    var clockTimer = setInterval(function () {
      var d = new Date();
      appRoot.querySelector('.p3-clock').textContent =
        String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }, 1000);

    // ── 미지원: 요구 사항 안내만 표시 (DOM 폴백 없음) ──
    function fallback(reason) {
      srcWrap.remove();
      clearInterval(clockTimer);
      caption.textContent = reason + ' — Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.';
      wrap.appendChild(caption);
      return { destroy: function () { wrap.remove(); } };
    }
    if (!drawFn) return fallback('drawElementImage 미지원');
    if (!window.THREE) return fallback('three.js(vendor) 로드 실패');

    // ── three.js 장면 ──
    var THREE = window.THREE;
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return fallback('WebGL 초기화 실패');
    }
    var FW = 760, FH = 520;
    renderer.setSize(FW, FH);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.domElement.className = 'p3-gl';
    wrap.appendChild(renderer.domElement);
    wrap.appendChild(caption);
    wrap.appendChild(errBox);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(32, FW / FH, 0.1, 10);
    camera.position.set(0, 0.05, 2.6);
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 3, 4);
    scene.add(key);
    var rim = new THREE.PointLight(0x8b5cf6, 0.8, 10);
    rim.position.set(-2.4, -1, 2);
    scene.add(rim);

    var phone = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: 0x14151c, roughness: 0.35, metalness: 0.7 });
    var body = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.36, 0.065), bodyMat);
    phone.add(body);
    var frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 1.38, 0.05),
      new THREE.MeshStandardMaterial({ color: 0x2a2c38, roughness: 0.25, metalness: 0.9 })
    );
    frameMesh.position.z = -0.002;
    phone.add(frameMesh);

    var texture = new THREE.CanvasTexture(src);
    texture.encoding = THREE.sRGBEncoding;
    texture.minFilter = THREE.LinearFilter;   // NPOT(360x720) → 밉맵 금지
    texture.generateMipmaps = false;
    var screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 1.24),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    screenMesh.position.z = 0.034;
    phone.add(screenMesh);
    scene.add(phone);

    // ── paint 이벤트 촬영 모델 ──
    var lastDrawErrs = null, captureOk = false, paintSeen = false, failStreak = 0, errShown = false;
    function drawCompat() {
      var tries = [
        ['(el,x,y)', function () { sctx[drawFn](appRoot, 0, 0); }],
        ['(el,x,y,w,h)', function () { sctx[drawFn](appRoot, 0, 0, W, H); }],
        ['(el)', function () { sctx[drawFn](appRoot); }],
      ];
      var errs = [];
      for (var i = 0; i < tries.length; i++) {
        try { tries[i][1](); return true; }
        catch (e) { errs.push(tries[i][0] + ' → ' + e.name + ': ' + e.message); }
      }
      lastDrawErrs = errs;
      return false;
    }
    function snap() {
      if (sctx.reset) sctx.reset(); else sctx.clearRect(0, 0, W, H);
      if (drawCompat()) {
        captureOk = true; failStreak = 0;
        texture.needsUpdate = true;
        return;
      }
      failStreak++;
      if (!captureOk && failStreak === 90 && lastDrawErrs && !errShown) {
        errShown = true;
        errBox.style.display = 'block';
        errBox.textContent = '⚠️ 촬영 계속 실패 — 이 메시지를 그대로 알려주세요.\n' + lastDrawErrs.join('\n');
      }
    }
    src.addEventListener('paint', function () { paintSeen = true; snap(); });

    // ── 입력 포워딩 ──
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    function screenHit(e) {
      var r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObject(screenMesh);
      if (!hits.length) return null;
      return { x: hits[0].uv.x * W, y: (1 - hits[0].uv.y) * H };
    }
    function localRect(node) { // appRoot 기준 offset 누적
      var l = 0, t = 0, cur = node;
      while (cur && cur !== appRoot) { l += cur.offsetLeft; t += cur.offsetTop; cur = cur.offsetParent; }
      return { l: l, t: t, r: l + node.offsetWidth, b: t + node.offsetHeight };
    }
    function hitEl(x, y) {
      var els = appRoot.querySelectorAll('.p3-on *, .p3-status *');
      var best = null, bestDepth = -1;
      for (var i = 0; i < els.length; i++) {
        if (!els[i].offsetWidth) continue;
        var rc = localRect(els[i]);
        if (x >= rc.l && x < rc.r && y >= rc.t && y < rc.b) {
          var d = 0, p = els[i];
          while (p && p !== appRoot) { d++; p = p.parentElement; }
          if (d >= bestDepth) { bestDepth = d; best = els[i]; }
        }
      }
      return best;
    }

    var hoverEl = null, dragging = false, lastX = 0, lastY = 0;
    var baseY = -0.35, baseX = 0.02;
    var api; // knobs에서 state 접근

    function setHover(n) {
      if (hoverEl === n) return;
      if (hoverEl) hoverEl.classList.remove('cui-hover');
      hoverEl = n;
      if (hoverEl) hoverEl.classList.add('cui-hover');
    }
    function onMove(e) {
      if (dragging) {
        baseY += (e.clientX - lastX) * 0.008;
        baseX += (e.clientY - lastY) * 0.006;
        baseX = Math.max(-0.5, Math.min(0.5, baseX));
        lastX = e.clientX; lastY = e.clientY;
        return;
      }
      var p = screenHit(e);
      if (!p) { setHover(null); renderer.domElement.style.cursor = 'grab'; return; }
      var n = hitEl(p.x, p.y);
      var target = n && (n.closest('input') || n.closest('button,[data-nav]'));
      setHover(target || null);
      renderer.domElement.style.cursor = target
        ? (target.tagName === 'INPUT' ? 'text' : 'pointer') : 'default';
    }
    function onDown(e) {
      var p = screenHit(e);
      if (!p) {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        renderer.domElement.classList.add('p3-drag');
        return;
      }
      e.preventDefault(); // canvas로 focus가 넘어가지 않게 → 앱 input 포커스 유지
      var n = hitEl(p.x, p.y);
      var input = n && n.closest('input');
      if (input) {
        input.focus({ preventScroll: true });
        try { var len = input.value.length; input.setSelectionRange(len, len); } catch (ig) {}
        return;
      }
      var press = n && n.closest('button, [data-nav]');
      if (press) { press.classList.add('cui-active'); press.click(); setTimeout(function () { press.classList.remove('cui-active'); }, 140); return; }
      if (appRoot.contains(document.activeElement)) document.activeElement.blur();
    }
    function onUp() { dragging = false; renderer.domElement.classList.remove('p3-drag'); }
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);

    // ── 루프 ──
    var rafId = 0, destroyed = false;
    function frame(t) {
      if (destroyed) return;
      try {
        if (typeof src.requestPaint === 'function') src.requestPaint();
        if (!paintSeen) snap(); // paint 이벤트 미지원 빌드 폴백
        var spin = api.state.spin;
        phone.rotation.y = baseY + Math.sin(t / 2400) * 0.06 + t * 0.0001 * spin;
        phone.rotation.x = baseX + Math.cos(t / 3100) * 0.02;
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
      state: { spin: 0 },
      bodyMat: bodyMat,
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(rafId);
        clearInterval(clockTimer);
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
    function row(label, input) {
      var l = document.createElement('label');
      l.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:13px;color:var(--cui-muted,#a1a1aa);margin-right:16px;';
      l.appendChild(document.createTextNode(label));
      l.appendChild(input);
      el.appendChild(l);
    }
    var spin = document.createElement('input');
    spin.type = 'range'; spin.min = '0'; spin.max = '10'; spin.value = '0';
    spin.addEventListener('input', function () { api.state.spin = Number(spin.value); });
    row('자동 회전', spin);
    if (api.bodyMat) {
      var col = document.createElement('input');
      col.type = 'color'; col.value = '#14151c';
      col.addEventListener('input', function () { api.bodyMat.color.set(col.value); });
      row('본체 색', col);
    }
  }

  window.CUIDocs.register({
    id: 'phone-3d',
    section: 'components',
    name: '3D 폰 앱',
    emoji: '📱',
    oneLiner: '3D 폰 속 진짜 앱 — 아이콘 실행부터 폼 타이핑까지',
    code: CODE,
    mount: mount,
    knobs: knobs,
  });
})();
