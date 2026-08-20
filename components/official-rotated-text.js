/**
 * 공식 WICG 데모 이식 — complex-text.html (회전 복합 텍스트)
 * 원본: https://github.com/WICG/html-in-canvas/blob/main/Examples/Examples/complex-text.html
 *
 * 원본 렌더 모델(코어 버퍼 패턴과 다름 — 충실도 우선으로 원본 방식 유지):
 *  - canvas 자체에 layoutsubtree, 그릴 요소는 canvas의 자식
 *  - 별도 표시 canvas 없이 소스 canvas의 paint 이벤트 안에서 직접
 *    reset → rotate → translate → drawElementImage
 *  - drawElementImage가 반환한 transform(DOMMatrix)을 요소 style.transform에
 *    되적용해 라이브 요소 위치(히트테스트)를 그린 위치와 동기화
 *  - canvas.requestPaint()로 페인트 요청, ResizeObserver(device-pixel-content-box)로
 *    캔버스 버퍼를 실제 디바이스 픽셀에 동기화
 *
 * 함정 규칙 적용: 촬영은 paint 핸들러 안에서만, 밖에서는 requestPaint 요청만.
 * 시그니처 3종 순차 try + 실패 시 에러 전체 나열. 실험 API는 감지 가드 뒤에.
 * (원본의 외부 이미지 wolf.jpg는 CDN 금지 규칙에 따라 인라인 SVG로 대체)
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-official-rotated-text';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.ort-canvas { border: 1px solid #4a6cf7; width: 640px; max-width: 100%; height: 320px; background: #fff; }',
      '.ort-content { width: 550px; font: 16px/1.7 system-ui, sans-serif; color: #1a1a2e; }',
      '.ort-content b { color: #c0392b; }',
      '.ort-content a { color: #4a6cf7; }',
      '.ort-fallback { border: 1px dashed #aaa; padding: 12px; }',
      '.ort-note { font-size: 13px; color: #666; margin-top: 8px; }',
      '.ort-error { display: none; margin-top: 8px; padding: 8px; background: #fdecea; color: #b71c1c; font: 12px/1.5 monospace; white-space: pre-wrap; }',
      '.ort-knobs { display: flex; align-items: center; gap: 8px; margin-top: 10px; font: 14px system-ui, sans-serif; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  // 원본 draw_element에 대응하는 한글 예문 (메커니즘 항목 보존:
  // 여러 줄·서식·이모지·RTL·세로쓰기·인라인 SVG)
  var CONTENT_HTML =
    '<div class="ort-content">' +
    '<a href="https://github.com/WICG/html-in-canvas">html-in-canvas</a>에서 인사드립니다!' +
    '<br>저는 여러 줄로 된 <b>서식 있는</b> 회전 텍스트예요. ' +
    '이모지(😀), RTL 텍스트 <span dir="rtl">من فارسی صحبت میکنم</span>, ' +
    '세로쓰기 텍스트,' +
    '<p style="writing-mode: vertical-rl; margin: 4px 8px; height: 110px;">세로로 쓴 한글</p>' +
    '그리고 인라인 SVG(' +
    '<svg width="50" height="50" style="vertical-align: middle;">' +
    '<circle cx="25" cy="25" r="20" fill="green"></circle>' +
    '<text x="25" y="30" font-size="15" text-anchor="middle" fill="#fff">SVG</text>' +
    '</svg>)까지!' +
    '</div>';

  function mount(el) {
    ensureStyle();

    // ── 감지 가드: 실험 API 존재 확인 후에만 원본 경로 진입 ──
    var probe = document.createElement('canvas').getContext('2d');
    var drawFnName = ['drawElementImage', 'drawElement'].filter(function (n) {
      return typeof probe[n] === 'function';
    })[0] || null;

    var wrap = document.createElement('div');
    el.appendChild(wrap);

    var errBox = document.createElement('div');
    errBox.className = 'ort-error';

    if (!drawFnName) {
      // 미지원: 요구 사항 안내만 표시 (DOM 폴백 없음)
      var need = document.createElement('div'); need.style.cssText = 'padding:24px;text-align:center;font-size:14px;color:#a1a1aa;border:1px dashed #333;border-radius:12px;'; need.textContent = 'Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.'; wrap.appendChild(need);
      return { destroy: function () { wrap.remove(); } };
    }

    // ── 원본 구조: canvas(layoutsubtree) 안에 그릴 요소를 자식으로 배치 ──
    var canvas = document.createElement('canvas');
    canvas.className = 'ort-canvas';
    canvas.width = 640;
    canvas.height = 320;
    canvas.setAttribute('layoutsubtree', 'true');
    canvas.innerHTML = CONTENT_HTML;
    var drawEl = canvas.firstElementChild;
    var ctx = canvas.getContext('2d');
    wrap.appendChild(canvas);
    wrap.appendChild(errBox);

    var state = { angle: 15, tx: 80, ty: -20 };
    var destroyed = false;
    var firstError = null;

    function showError(msg) {
      if (firstError) return;
      firstError = msg;
      errBox.style.display = 'block';
      errBox.textContent = '⚠️ drawElementImage 실패 — 이 메시지를 그대로 알려주세요.\n' + msg;
    }

    /** 시그니처 3종 순차 try. 성공 시 반환값(transform), 전부 실패 시 에러 전체 나열. */
    function drawElementCompat(c, target) {
      var attempts = [
        ['(el,x,y)', function () { return c[drawFnName](target, 0, 0); }],
        ['(el,x,y,w,h)', function () { return c[drawFnName](target, 0, 0, canvas.width, canvas.height); }],
        ['(el)', function () { return c[drawFnName](target); }],
      ];
      var errs = [];
      for (var i = 0; i < attempts.length; i++) {
        try { return { ok: true, transform: attempts[i][1]() }; }
        catch (e) { errs.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
      }
      return { ok: false, errs: errs };
    }

    var paintSeen = false;

    /** 원본 onpaint 본체: reset → rotate → translate → drawElementImage → transform 되적용. */
    function paintFrame() {
      if (destroyed) return;
      try {
        if (ctx.reset) ctx.reset();
        else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
        ctx.rotate((state.angle * Math.PI) / 180);
        ctx.translate(state.tx * devicePixelRatio, state.ty * devicePixelRatio);
        var r = drawElementCompat(ctx, drawEl);
        if (!r.ok) { showError(r.errs.join('\n')); return; }
        // 반환 transform을 라이브 요소에 되적용 → 그린 위치와 히트테스트 동기화 (원본 메커니즘)
        if (r.transform && typeof r.transform.toString === 'function') {
          drawEl.style.transform = r.transform.toString();
        }
      } catch (e) {
        showError(e.name + ': ' + e.message);
      }
    }

    function onPaint() { paintSeen = true; paintFrame(); }
    canvas.addEventListener('paint', onPaint);

    /** 촬영은 paint 핸들러 안에서만 — 밖에서는 요청만 한다. */
    function requestRepaint() {
      if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
      else paintFrame(); // paint 이벤트 미지원 빌드 폴백
    }
    requestRepaint();
    // paint 이벤트가 안 오는 빌드 폴백: 잠시 후에도 미도착이면 직접 1회 시도
    var fallbackTimer = setTimeout(function () { if (!paintSeen) paintFrame(); }, 600);

    // 원본의 ResizeObserver: 캔버스 버퍼를 디바이스 픽셀 크기에 동기화
    var observer = null;
    if (typeof ResizeObserver === 'function') {
      observer = new ResizeObserver(function (entries) {
        var entry = entries[0];
        if (!entry || !entry.devicePixelContentBoxSize || !entry.devicePixelContentBoxSize[0]) return;
        canvas.width = entry.devicePixelContentBoxSize[0].inlineSize;
        canvas.height = entry.devicePixelContentBoxSize[0].blockSize;
        requestRepaint();
      });
      try { observer.observe(canvas, { box: 'device-pixel-content-box' }); }
      catch (e) { observer.observe(canvas); }
    }

    return {
      state: state,
      requestRepaint: requestRepaint,
      destroy: function () {
        destroyed = true;
        clearTimeout(fallbackTimer);
        if (observer) observer.disconnect();
        canvas.removeEventListener('paint', onPaint);
        wrap.remove();
      },
    };
  }

  function knobs(el, api) {
    if (!api || !api.state) return; // 폴백 모드에는 노브 없음
    var row = document.createElement('div');
    row.className = 'ort-knobs';
    var label = document.createElement('label');
    label.textContent = '회전 각도';
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '-45';
    slider.max = '45';
    slider.value = String(api.state.angle);
    var val = document.createElement('span');
    val.textContent = api.state.angle + '°';
    slider.addEventListener('input', function () {
      api.state.angle = Number(slider.value);
      val.textContent = slider.value + '°';
      api.requestRepaint();
    });
    row.appendChild(label);
    row.appendChild(slider);
    row.appendChild(val);
    el.appendChild(row);
  }

  window.CUIDocs.register({
    id: 'official-rotated-text',
    name: '회전 복합 텍스트',
    emoji: '🌀',
    section: 'official',
    oneLiner: '복잡한 스타일 텍스트를 회전해 그린다 (공식 데모 이식)',
    code: [
      "// 원본 메커니즘 (WICG complex-text.html)",
      "// canvas(layoutsubtree) 안에 그릴 요소를 자식으로 배치하고,",
      "// 촬영은 canvas의 paint 이벤트 안에서만 수행한다.",
      "canvas.addEventListener('paint', () => {",
      "  ctx.reset();",
      "  ctx.rotate((angle * Math.PI) / 180);",
      "  ctx.translate(80 * devicePixelRatio, -20 * devicePixelRatio);",
      "  const transform = ctx.drawElementImage(drawEl, 0, 0);",
      "  // 반환 transform을 요소에 되적용 → 히트테스트 위치 동기화",
      "  drawEl.style.transform = transform.toString();",
      "});",
      "canvas.requestPaint(); // 밖에서는 페인트 '요청'만",
      "",
      "// 캔버스 버퍼를 디바이스 픽셀에 동기화",
      "new ResizeObserver(([entry]) => {",
      "  canvas.width = entry.devicePixelContentBoxSize[0].inlineSize;",
      "  canvas.height = entry.devicePixelContentBoxSize[0].blockSize;",
      "}).observe(canvas, { box: 'device-pixel-content-box' });",
    ].join('\n'),
    mount: mount,
    knobs: knobs,
  });
})();
