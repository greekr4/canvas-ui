/**
 * official-form — WICG html-in-canvas 공식 데모 'text-input.html' 이식
 * 원본: https://github.com/WICG/html-in-canvas/blob/main/Examples/text-input.html
 *
 * 원본 렌더 모델(코어의 버퍼 패턴과 다름 → 충실도 우선, 원본 방식 유지):
 *  - 소스 요소(div)를 canvas[layoutsubtree]의 '자식'으로 둔다 (자식은 화면에 그려지지 않음)
 *  - canvas의 paint 이벤트 안에서 ctx.drawElementImage(el, x, y) 촬영
 *  - 반환된 DOMMatrix transform을 요소의 style.transform에 되먹여
 *    실제 히트테스트/포커스 위치를 캔버스 그림과 동기화 (setHitTestRegions 미사용)
 *  - ResizeObserver(device-pixel-content-box)로 캔버스 버퍼를 물리 픽셀에 동기화
 *
 * 함정 규칙 적용:
 *  - 촬영은 paint 핸들러 안에서만, rAF에서는 requestPaint 요청만 (paint 미지원 빌드 폴백 별도)
 *  - 시그니처 3종 순차 try + 계속 실패 시 에러 전체 나열
 *  - getImageData/toDataURL 미사용, 실험 API는 전부 감지 가드 뒤에
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-official-form';
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      /* 원본 CSS 충실 재현: 파란 테두리 638x318 캔버스, p 여백 6px */
      '.of-canvas{border:1px solid blue;width:638px;max-width:100%;height:318px;display:block;background:#fff;}',
      '.of-draw{width:578px;}',
      /* 문서 사이트가 다크 테마라 글자색이 흰색으로 상속됨 → 흰 캔버스 위 white-on-white 방지 */
      '.of-form{color:#111;font-family:sans-serif;}',
      '.of-form p{margin:6px;}',
      '.of-form fieldset{margin:6px;}',
      '.of-note{margin-top:8px;font-size:13px;color:#666;}',
      '.of-err{display:none;margin-top:8px;padding:8px;background:#fee;color:#900;font:12px/1.5 monospace;white-space:pre-wrap;border-radius:4px;}',
    ].join('\n');
    document.head.appendChild(st);
  }

  var FORM_HTML =
    '<form class="of-form" action="#">' +
      '<fieldset>' +
        '<legend>🚀 우주선 제어판</legend>' +
        '<p><label>함선 이름: <input type="text" name="ship" value="한별호"></label></p>' +
        '<p><label><input type="checkbox" name="hyper"> 하이퍼드라이브 가동</label></p>' +
        '<fieldset>' +
          '<legend>목표 항성계</legend>' +
          '<label><input type="radio" name="target" value="alpha" checked> 알파 센타우리</label> ' +
          '<label><input type="radio" name="target" value="betel"> 베텔게우스</label>' +
        '</fieldset>' +
        '<p><label>실드 출력: <input type="range" name="shield" min="0" max="100" value="75"></label></p>' +
        '<p><button type="submit">발사!</button> <output name="status"></output></p>' +
      '</fieldset>' +
    '</form>';

  function mount(el) {
    var supported = Boolean(window.CanvasUI && window.CanvasUI.supported);
    var drawFn = supported ? window.CanvasUI.drawFnName : null;

    var wrap = document.createElement('div');
    el.appendChild(wrap);

    var drawEl = document.createElement('div');
    drawEl.className = 'of-draw';
    drawEl.innerHTML = FORM_HTML;

    var form = drawEl.querySelector('form');
    var out = form.querySelector('output');
    function onSubmit(e) {
      e.preventDefault();
      var name = form.elements.ship.value || '(무명)';
      out.value = name + ' 발사 준비 완료';
    }
    form.addEventListener('submit', onSubmit);

    var note = document.createElement('div');
    note.className = 'of-note';
    note.textContent = '캔버스에 그려진 폼을 클릭·입력하면 실제 폼 요소가 그대로 반응합니다.';

    // ── 미지원: 요구 사항 안내만 표시 (DOM 폴백 없음) ──
    if (!supported) {
      var need = document.createElement('div'); need.style.cssText = 'padding:24px;text-align:center;font-size:14px;color:#a1a1aa;border:1px dashed #333;border-radius:12px;'; need.textContent = 'Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.'; wrap.appendChild(need);
      return {
        destroy: function () { form.removeEventListener('submit', onSubmit); wrap.remove(); },
      };
    }

    // ── 원본 구조: canvas[layoutsubtree] 자식으로 소스 요소 배치 ──
    var canvas = document.createElement('canvas');
    canvas.className = 'of-canvas';
    canvas.width = 638;
    canvas.height = 318;
    canvas.setAttribute('layoutsubtree', 'true');
    canvas.appendChild(drawEl);
    wrap.appendChild(canvas);
    wrap.appendChild(note);

    var errBox = document.createElement('div');
    errBox.className = 'of-err';
    wrap.appendChild(errBox);

    var ctx = canvas.getContext('2d');
    var destroyed = false, rafId = 0;
    var paintSeen = false, captureOk = false, failStreak = 0, firstError = null;
    var lastErrs = null;

    function showError(msg) {
      if (firstError) return;
      firstError = msg;
      errBox.style.display = 'block';
      errBox.textContent = '⚠️ 촬영 실패 — 이 메시지를 그대로 알려주세요.\n' + msg;
    }

    /** 시그니처 3종 순차 try. 성공 시 반환값(transform 후보)을 보존한다. */
    function drawCompat(x, y) {
      var attempts = [
        ['(el,x,y)', function () { return ctx[drawFn](drawEl, x, y); }],
        ['(el,x,y,w,h)', function () { return ctx[drawFn](drawEl, x, y, canvas.width, canvas.height); }],
        ['(el)', function () { return ctx[drawFn](drawEl); }],
      ];
      var errs = [];
      for (var i = 0; i < attempts.length; i++) {
        try { return { ok: true, transform: attempts[i][1]() }; }
        catch (e) { errs.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
      }
      lastErrs = errs;
      return { ok: false };
    }

    /** 원본 onpaint 본체: 촬영 + 반환 transform으로 실제 요소 위치 동기화. */
    function paintOnce() {
      try {
        if (ctx.reset) ctx.reset(); else ctx.clearRect(0, 0, canvas.width, canvas.height);
        var x = canvas.width / 25;
        var y = canvas.height / 25;
        var r = drawCompat(x, y);
        if (r.ok) {
          captureOk = true; failStreak = 0;
          if (r.transform && typeof r.transform.toString === 'function') {
            drawEl.style.transform = r.transform.toString(); // 히트테스트/포커스 정렬
          }
        } else {
          failStreak++;
          if (!captureOk && failStreak === 90 && lastErrs) showError(lastErrs.join('\n'));
        }
      } catch (e) {
        showError(e.name + ': ' + e.message);
      }
    }

    // 촬영은 paint 이벤트 안에서만 안정 ("No cached paint record" 회피)
    canvas.addEventListener('paint', function () {
      paintSeen = true;
      paintOnce();
    });

    // rAF에서는 재촬영을 '요청'만. paint 이벤트가 안 오는 빌드는 직접 시도 폴백.
    function tick() {
      if (destroyed) return;
      if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
      if (!paintSeen) paintOnce();
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    if (typeof canvas.requestPaint === 'function') canvas.requestPaint(); // 원본의 초기 요청

    // 원본의 ResizeObserver: 캔버스 버퍼를 물리 픽셀 크기에 동기화
    var ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(function (entries) {
        var entry = entries[0];
        var s = entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
        if (s) {
          canvas.width = s.inlineSize;
          canvas.height = s.blockSize;
          if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
        }
      });
      try { ro.observe(canvas, { box: 'device-pixel-content-box' }); }
      catch (ignored) { ro.observe(canvas); }
    }

    return {
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(rafId);
        if (ro) ro.disconnect();
        form.removeEventListener('submit', onSubmit);
        wrap.remove();
      },
    };
  }

  window.CUIDocs.register({
    id: 'official-form',
    name: '인터랙티브 폼',
    emoji: '🚀',
    section: 'official',
    oneLiner: '캔버스 속 폼 입력 상호작용 (공식 데모 이식)',
    code: [
      "// 원본 메커니즘: 소스 요소를 canvas[layoutsubtree]의 자식으로 두고,",
      "// paint 이벤트 안에서 촬영 + 반환된 transform으로 실제 요소를 정렬한다.",
      "canvas.addEventListener('paint', () => {",
      "  ctx.reset();",
      "  const x = canvas.width / 25, y = canvas.height / 25;",
      "  const transform = ctx.drawElementImage(drawEl, x, y);",
      "  drawEl.style.transform = transform.toString(); // 히트테스트/포커스 동기화",
      "});",
      "canvas.requestPaint();",
      "",
      "new ResizeObserver(([entry]) => {",
      "  canvas.width = entry.devicePixelContentBoxSize[0].inlineSize;",
      "  canvas.height = entry.devicePixelContentBoxSize[0].blockSize;",
      "}).observe(canvas, { box: 'device-pixel-content-box' });",
    ].join('\n'),
    mount: mount,
  });
})();
