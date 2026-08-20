/**
 * official-pie-chart — WICG html-in-canvas 공식 파이 차트 데모 이식
 * 원본: https://github.com/WICG/html-in-canvas/blob/main/Examples/pie-chart.html
 *
 * 원본 렌더 모델(코어의 2-canvas 버퍼 패턴과 다름 — 충실도 우선 유지):
 *  - layoutsubtree canvas 하나가 라벨 DOM을 자식으로 소유하고, 그 canvas에 직접 그린다.
 *  - 모든 드로잉은 paint 이벤트 핸들러 안에서만 수행 ("No cached paint record" 회피).
 *  - drawElementImage(label, x, y)의 반환값(transform)을 라벨 style.transform에
 *    되돌려 적용 → 브라우저 네이티브 포커스/히트테스트가 캔버스 위치와 일치.
 *  - requestPaint()는 요청만: 초기 1회 + 포커스 변화 + 리사이즈 시.
 *  - ResizeObserver(device-pixel-content-box)로 DPR 변화에 맞춰 버퍼 크기 동기화.
 *
 * 함정 규칙 적용: 실험 API 전부 감지 가드, 시그니처 3종 순차 try + 실패 시 에러
 * 전체 나열, getImageData/toDataURL 미사용.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-official-pie-chart';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.opie-wrap { display: flex; flex-direction: column; align-items: center; gap: 10px; }',
      '.opie { width: 250px; height: 250px; }',
      /* 라벨이 조각 폭보다 넓어지며 줄바꿈되면 배치가 깨진다 → nowrap + 축소 폰트 */
      '.opie .opie-label { text-align: center; white-space: nowrap; font-family: sans-serif;',
      '  color: #fff; text-shadow: 0 1px 3px rgba(0,0,0,0.45); line-height: 1.25; }',
      '.opie .opie-label .opie-val { display: block; font-size: 19px; font-weight: bold; }',
      '.opie .opie-label .opie-name { font-size: 12px; opacity: 0.9; }',
      '.opie-hint { font-size: 12px; opacity: 0.75; }',
      '.opie-err { display: none; white-space: pre-wrap; font-size: 12px; color: #c0392b; ',
      '  border: 1px solid #c0392b; border-radius: 6px; padding: 8px; max-width: 420px; }',
      /* 미지원 폴백: 라벨을 일반 리스트로 표시 */
      '.opie-fallback .opie-label { max-width: none; padding: 6px 10px; border-radius: 6px; ',
      '  margin: 4px 0; color: #222; }',
      '.opie-fallback .opie-label .opie-val { font-size: large; display: inline; margin-right: 8px; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  // 데이터: 월 지출 100만 원 구성 (원본의 45/35/20% 비율 유지)
  var DATA = [
    { name: '식비', amount: '45만 원', val: 0.45, color: 'tomato' },
    { name: '교통·통신', amount: '35만 원', val: 0.35, color: 'cornflowerblue' },
    { name: '여가', amount: '20만 원', val: 0.20, color: 'gold' },
  ];

  function buildLabels() {
    // 원본과 동일: canvas의 자식 div가 다중행 라벨 (금액 큰 글씨 + 항목명)
    return DATA.map(function (d) {
      return '<div class="opie-label" role="listitem" tabindex="0"' +
        ' data-val="' + d.val + '" data-color="' + d.color + '">' +
        '<span class="opie-val">' + d.amount + '</span><span class="opie-name">' + d.name + '</span>' +
        '</div>';
    }).join('');
  }

  function mount(el) {
    ensureStyle();

    var CUI = window.CanvasUI || {};
    var supported = Boolean(CUI.supported);
    var drawFnName = CUI.drawFnName || 'drawElementImage';

    var wrap = document.createElement('div');
    wrap.className = 'opie-wrap';
    wrap.innerHTML =
      '<canvas layoutsubtree class="opie" role="list" aria-label="월 지출 파이 차트">' +
      buildLabels() +
      '</canvas>' +
      '<div class="opie-hint">Tab 키로 조각을 이동하면 포커스 링이 캔버스 위에 그려집니다 (합계 100만 원).</div>' +
      '<div class="opie-err"></div>';
    el.appendChild(wrap);

    var canvas = wrap.querySelector('canvas');
    var errBox = wrap.querySelector('.opie-err');
    var destroyed = false;
    var ro = null;

    function showError(title, msg) {
      errBox.style.display = 'block';
      errBox.textContent = '⚠️ ' + title + '\n' + msg;
    }

    // ── 미지원: 요구 사항 안내만 표시 (DOM 폴백 없음) ──
    if (!supported) {
      canvas.style.display = 'none';
      var need = document.createElement('div'); need.style.cssText = 'padding:24px;text-align:center;font-size:14px;color:#a1a1aa;border:1px dashed #333;border-radius:12px;'; need.textContent = 'Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.'; wrap.appendChild(need);
      return {
        destroy: function () { destroyed = true; wrap.remove(); },
      };
    }

    var ctx = canvas.getContext('2d');

    /** 시그니처 3종 순차 try. 성공 시 { ok:true, ret } (ret = 반환 transform), 실패 시 에러 전체. */
    function drawElementCompat(label, x, y, w, h) {
      var attempts = [
        ['(el,x,y)', function () { return ctx[drawFnName](label, x, y); }],
        ['(el,x,y,w,h)', function () { return ctx[drawFnName](label, x, y, w, h); }],
        ['(el)', function () { return ctx[drawFnName](label); }],
      ];
      var errs = [];
      for (var i = 0; i < attempts.length; i++) {
        try { return { ok: true, ret: attempts[i][1]() }; }
        catch (e) { errs.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
      }
      return { ok: false, errs: errs };
    }

    var failReported = false;

    // ── 원본 메커니즘: 모든 드로잉은 paint 핸들러 안에서 ──
    function paint() {
      try {
        if (ctx.reset) ctx.reset();
        else ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. 좌표계를 중앙으로
        var radius = 0.95 * Math.min(canvas.width, canvas.height) / 2;
        ctx.translate(canvas.width / 2, canvas.height / 2);

        var angle = 0;
        var focusedPath = null;
        var labels = Array.prototype.slice.call(canvas.children);
        for (var i = 0; i < labels.length; i++) {
          var label = labels[i];
          var slice = Number(label.dataset.val) * Math.PI * 2;

          // 2. 조각(wedge) 그리기 — 중심을 밝게 섞은 방사형 그라데이션
          var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
          try {
            grad.addColorStop(0, 'color-mix(in srgb, ' + label.dataset.color + ', white 40%)');
          } catch (e) {
            grad.addColorStop(0, label.dataset.color); // color-mix 미지원 빌드 폴백
          }
          grad.addColorStop(1, label.dataset.color);
          ctx.fillStyle = grad;
          var path = new Path2D();
          path.moveTo(0, 0);
          path.arc(0, 0, radius, angle, angle + slice);
          path.closePath();
          ctx.fill(path);
          if (document.activeElement === label) focusedPath = path;

          // 3. 다중행 DOM 라벨을 조각 위에 합성하고, 반환된 transform을
          //    라벨에 되돌려 적용 → 네이티브 포커스/히트테스트 위치 일치
          var mid = angle + slice / 2;
          var lw = label.offsetWidth * devicePixelRatio;
          var lh = label.offsetHeight * devicePixelRatio;
          var x = Math.cos(mid) * radius * 0.60 - lw / 2;
          var y = Math.sin(mid) * radius * 0.60 - lh / 2;
          var res = drawElementCompat(label, x, y, lw, lh);
          if (res.ok) {
            if (res.ret != null) label.style.transform = String(res.ret);
          } else if (!failReported) {
            failReported = true;
            showError(drawFnName + ' 모든 시그니처 실패', res.errs.join('\n'));
          }

          angle += slice;
        }

        // 4. 포커스 링을 맨 위에
        if (focusedPath && typeof ctx.drawFocusIfNeeded === 'function') {
          ctx.drawFocusIfNeeded(focusedPath, document.activeElement);
        }
      } catch (e) {
        showError('paint 핸들러 예외', e.name + ': ' + e.message);
      }
    }

    /** 재촬영 '요청'만 — 실제 드로잉은 paint 이벤트에서. 미지원 빌드는 직접 1회 그림. */
    function repaint() {
      if (destroyed) return;
      if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
      else paint();
    }

    var paintSeen = false;
    function onPaint() { paintSeen = true; paint(); }
    canvas.addEventListener('paint', onPaint);

    // 포커스 이동(Tab) 시 포커스 링 갱신
    function onFocusChange() { repaint(); }
    canvas.addEventListener('focusin', onFocusChange);
    canvas.addEventListener('focusout', onFocusChange);

    // DPR·크기 변화에 맞춰 canvas 버퍼 동기화 (원본 메커니즘, 미지원 브라우저 가드)
    try {
      ro = new ResizeObserver(function (entries) {
        if (destroyed) return;
        var entry = entries[0];
        var box = entry.devicePixelContentBoxSize && entry.devicePixelContentBoxSize[0];
        if (box) {
          canvas.width = box.inlineSize;
          canvas.height = box.blockSize;
        } else {
          canvas.width = Math.round(entry.contentRect.width * devicePixelRatio);
          canvas.height = Math.round(entry.contentRect.height * devicePixelRatio);
        }
        repaint();
      });
      ro.observe(canvas, { box: ['device-pixel-content-box'] });
    } catch (e) {
      canvas.width = Math.round(250 * devicePixelRatio);
      canvas.height = Math.round(250 * devicePixelRatio);
    }

    repaint(); // 초기 paint 요청 (원본의 canvas.requestPaint())
    // paint 이벤트가 안 오는 빌드 폴백: 잠시 후에도 미도착이면 직접 1회 그림
    var fallbackTimer = setTimeout(function () {
      if (!destroyed && !paintSeen) paint();
    }, 600);

    return {
      destroy: function () {
        destroyed = true;
        clearTimeout(fallbackTimer);
        if (ro) ro.disconnect();
        canvas.removeEventListener('paint', onPaint);
        canvas.removeEventListener('focusin', onFocusChange);
        canvas.removeEventListener('focusout', onFocusChange);
        wrap.remove();
      },
    };
  }

  var CODE = [
    "// 원본 메커니즘 핵심: 드로잉은 전부 paint 핸들러 안에서.",
    "// layoutsubtree canvas가 라벨 DOM(다중행)을 자식으로 소유한다.",
    "canvas.addEventListener('paint', () => {",
    "  ctx.reset();",
    "  const radius = 0.95 * Math.min(canvas.width, canvas.height) / 2;",
    "  ctx.translate(canvas.width / 2, canvas.height / 2);",
    "  let angle = 0;",
    "  for (const label of canvas.children) {",
    "    const slice = Number(label.dataset.val) * Math.PI * 2;",
    "    // 조각: 방사형 그라데이션 + Path2D",
    "    const path = new Path2D();",
    "    path.moveTo(0, 0);",
    "    path.arc(0, 0, radius, angle, angle + slice);",
    "    path.closePath();",
    "    ctx.fill(path);",
    "    // 다중행 DOM 라벨 합성 — 반환된 transform을 라벨에 되돌려 적용하면",
    "    // 네이티브 포커스/히트테스트가 캔버스 위치와 일치한다.",
    "    const mid = angle + slice / 2;",
    "    const x = Math.cos(mid) * radius * 0.60 - label.offsetWidth * devicePixelRatio / 2;",
    "    const y = Math.sin(mid) * radius * 0.60 - label.offsetHeight * devicePixelRatio / 2;",
    "    const transform = ctx.drawElementImage(label, x, y);",
    "    label.style.transform = transform;",
    "    angle += slice;",
    "  }",
    "  // Tab 포커스 링도 캔버스 위에: ctx.drawFocusIfNeeded(path, document.activeElement)",
    "});",
    "canvas.requestPaint(); // 초기 1회 + 포커스/리사이즈 때만 재요청 (rAF 상시 루프 없음)",
  ].join('\n');

  window.CUIDocs.register({
    id: 'official-pie-chart',
    name: '파이 차트',
    emoji: '🥧',
    section: 'official',
    oneLiner: '다중행 DOM 라벨을 조각 위에 합성 (공식 데모 이식)',
    code: CODE,
    mount: mount,
  });
})();
