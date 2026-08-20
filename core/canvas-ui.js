/**
 * CanvasUI 코어 — HTML-in-Canvas(drawElementImage) 컴포넌트 라이브러리
 *
 * 검증된 패턴(html-in-canvas-kr/02-효과놀이터.html, PITFALLS.md) 기반:
 *  - API 감지: drawElementImage → drawElement 순서로 탐색
 *  - 호환 호출: (el,x,y) → (el,x,y,w,h) → (el) 순차 try
 *  - 소스 canvas 숨김: position:absolute; z-index:-1 겹침만 사용
 *    (display:none / visibility:hidden / left:-9999px 금지 — 페인트 생략 → 투명 촬영)
 *  - rAF 루프 전체 try/catch, 예외는 페이지 내 에러 박스에 표시하고 루프는 계속
 *  - getImageData / toDataURL 절대 금지 (SecurityError)
 *  - 버퍼 패턴: 소스 canvas(layoutsubtree)에 촬영 → 표시 canvas에 drawImage로 변형 복사
 *
 * 사용: <script src="core/canvas-ui.js"></script> 로드 후 window.CanvasUI 사용.
 * 의존성 0, 빌드 도구 없음.
 */
(function () {
  'use strict';

  // ── API 감지 (프로브 컨텍스트로 1회 판정) ──
  var probe = document.createElement('canvas').getContext('2d');
  var drawFnName = ['drawElementImage', 'drawElement'].filter(function (n) {
    return typeof probe[n] === 'function';
  })[0] || null;
  var supported = Boolean(drawFnName);

  /** 페이지 상단 감지 배지·미지원 안내를 1회만 삽입한다. */
  var pageUiDone = false;
  function ensurePageUI() {
    if (pageUiDone || !document.body) return;
    pageUiDone = true;
    var badge = document.createElement('div');
    badge.className = 'cui-badge ' + (supported ? 'cui-badge-ok' : 'cui-badge-no');
    badge.textContent = supported
      ? '✅ HTML-in-Canvas 지원됨 (ctx.' + drawFnName + ')'
      : '❌ HTML-in-Canvas 미지원 — Chromium 146 이상 + 플래그 필요';
    document.body.insertBefore(badge, document.body.firstChild);
    if (!supported) {
      var warn = document.createElement('div');
      warn.className = 'cui-warn';
      warn.innerHTML =
        '<strong>⚠️ 이 브라우저는 HTML-in-Canvas API를 지원하지 않습니다.</strong><br>' +
        'Chrome Canary(또는 Chromium 146 이상)에서 ' +
        '<code>chrome://flags/#canvas-draw-element</code>를 Enabled로 켜고 재시작해야 데모가 표시됩니다.';
      badge.after(warn);
    }
  }

  /**
   * 컴포넌트 인스턴스를 생성한다.
   * @param {Object} opts
   * @param {Element|string} opts.mount  컴포넌트가 들어갈 컨테이너(요소 또는 셀렉터)
   * @param {string} opts.html           컴포넌트 DOM 마크업 (루트 요소 1개)
   * @param {number} opts.width          fx canvas 버퍼 가로
   * @param {number} opts.height         fx canvas 버퍼 세로
   * @param {Function} [opts.effect]     (ctx, src, t, api) => void — 생략 시 src를 중앙에 그대로 그림
   * @param {boolean} [opts.interactive=true] 포인터 포워딩 활성 여부
   * @param {Function} [opts.onFrame]    (t, api) => void — 매 프레임, effect 앞에 호출(물리/파티클용)
   * @param {Function} [opts.onHit]      (el, ev, api) => boolean — pointerdown 훅. true면 기본 포워딩 생략
   * @returns {Object} handle(api)
   */
  function create(opts) {
    ensurePageUI();

    var mount = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
    if (!mount) throw new Error('CanvasUI.create: mount 컨테이너를 찾을 수 없습니다.');
    mount.classList.add('cui-mount');

    var interactive = opts.interactive !== false;
    var effect = opts.effect || null;
    var onFrame = opts.onFrame || null;
    var onHit = opts.onHit || null;

    // ── DOM 조립 ──
    // 표시(fx) canvas
    var fx = document.createElement('canvas');
    fx.className = 'cui-fx';
    fx.width = opts.width;
    fx.height = opts.height;
    var ctx = fx.getContext('2d');

    // 소스 canvas: root DOM을 소유(layoutsubtree). fx '뒤'에 z-index:-1로 겹쳐 숨긴다.
    var srcWrap = document.createElement('div');
    srcWrap.className = 'cui-src-wrap';
    var src = document.createElement('canvas');
    src.setAttribute('layoutsubtree', '');
    src.width = 10;
    src.height = 10;
    var sctx = src.getContext('2d');
    srcWrap.appendChild(src);

    // html 옵션 → root 요소 (루트 1개 강제)
    var tpl = document.createElement('div');
    tpl.innerHTML = opts.html;
    var root = tpl.firstElementChild;
    if (!root) throw new Error('CanvasUI.create: html에서 루트 요소를 찾을 수 없습니다.');
    root.classList.add('cui-root');

    // 인스턴스 에러 박스 (rAF 루프 예외를 페이지에 표시)
    var errBox = document.createElement('div');
    errBox.className = 'cui-error';

    if (supported) {
      src.appendChild(root);       // 소스 요소는 반드시 소유 canvas의 자식
      mount.appendChild(fx);
      mount.appendChild(srcWrap);  // fx 뒤에 겹침 (CSS: absolute + z-index:-1)
    } else {
      // 미지원: 데모를 표시하지 않는다 — 요구 사항 안내만 (DOM 폴백 없음)
      fx.classList.add('cui-hidden');
      mount.appendChild(fx);
      var need = document.createElement('div');
      need.className = 'cui-need';
      need.textContent = 'Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.';
      mount.appendChild(need);
    }
    mount.appendChild(errBox);

    // ── 상태 ──
    var destroyed = false;
    var rafId = 0;
    var firstError = null;
    var hitCache = [];                 // { el, l, t, r, b, depth } — 매 프레임 재계산
    var hoverEl = null;
    var activeEl = null;
    var center = { x: 0, y: 0 };       // src를 중앙 배치할 때의 좌상단 fx 좌표

    /** 예외를 페이지 내 에러 박스에 표시 (최초 1건만, 루프는 계속). */
    function showError(e, where) {
      if (firstError) return;
      firstError = e;
      errBox.style.display = 'block';
      errBox.textContent = '⚠️ ' + where + '에서 예외 발생 — 이 메시지를 그대로 알려주세요.\n' +
        e.name + ': ' + e.message;
    }

    /** 실험 API 시그니처 차이 흡수: (el,x,y) → (el,x,y,w,h) → (el) 순차 시도.
        실패 시 모든 시도의 에러를 보존해야 진짜 원인이 마지막 에러에 가려지지 않는다. */
    var lastDrawErrs = null;
    function drawElementCompat(c, el, x, y, w, h) {
      var attempts = [
        ['(el,x,y)', function () { c[drawFnName](el, x, y); }],
        ['(el,x,y,w,h)', function () { c[drawFnName](el, x, y, w, h); }],
        ['(el)', function () { c[drawFnName](el); }],
      ];
      var errs = [];
      for (var i = 0; i < attempts.length; i++) {
        try { attempts[i][1](); return true; }
        catch (e) { errs.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
      }
      lastDrawErrs = errs;
      return false;
    }

    /** root 실측 크기 → src 버퍼 크기 동기화 + center 갱신. */
    function measure() {
      var w = root.offsetWidth || opts.width;
      var h = root.offsetHeight || opts.height;
      if (src.width !== w) src.width = w;
      if (src.height !== h) src.height = h;
      center.x = (fx.width - src.width) / 2;
      center.y = (fx.height - src.height) / 2;
      syncSrcPosition();
    }

    /** 숨은 소스 canvas를 fx에 그려지는 위치에 정렬한다.
        OS 레이어 팝업(드롭다운·데이트피커·IME 후보창)은 '진짜 요소'의 위치에 뜨므로,
        정렬해 두면 팝업이 캔버스에 그려진 자리에서 열린다. */
    var lastSyncL = null, lastSyncT = null;
    function syncSrcPosition() {
      var scaleX = fx.clientWidth ? fx.clientWidth / fx.width : 1;
      var scaleY = fx.clientHeight ? fx.clientHeight / fx.height : 1;
      var left = fx.offsetLeft + center.x * scaleX;
      var top = fx.offsetTop + center.y * scaleY;
      if (left === lastSyncL && top === lastSyncT) return;
      lastSyncL = left; lastSyncT = top;
      srcWrap.style.left = left + 'px';
      srcWrap.style.top = top + 'px';
    }

    /** 살아있는 DOM → 소스 canvas에 이번 프레임 촬영 (버퍼 패턴 1단계).
        Chromium은 브라우저가 페인트 기록을 캐시한 시점(= src의 paint 이벤트 안)에만
        촬영을 허용한다("No cached paint record"). 따라서 snap은 paint 핸들러에서
        호출되는 것이 정상 경로이고, rAF 직접 호출은 paint 이벤트 미지원 빌드용 폴백. */
    var captureOk = false, paintSeen = false, failStreak = 0;
    function snap() {
      measure();
      if (sctx.reset) sctx.reset(); else sctx.clearRect(0, 0, src.width, src.height);
      if (drawElementCompat(sctx, root, 0, 0, src.width, src.height)) {
        captureOk = true; failStreak = 0;
        return true;
      }
      failStreak++;
      // 90프레임(~1.5초) 연속 실패 + 성공 이력 없음 → 진짜 문제로 보고
      if (!captureOk && failStreak === 90 && lastDrawErrs) {
        showError({ name: '촬영 계속 실패', message: lastDrawErrs.join('\n') }, 'drawElementImage');
      }
      return false;
    }

    if (supported) {
      src.addEventListener('paint', function () {
        paintSeen = true;
        snap();
      });
    }

    /** root 내 모든 요소의 offset 누적 rect를 캐시 (root 로컬 좌표 기준). */
    function rebuildHitCache() {
      hitCache.length = 0;
      var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el.offsetWidth && !el.offsetHeight) continue; // 표시 안 되는 요소 제외
        var l = 0, t = 0, n = el;
        while (n && n !== root) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent; }
        var d = 0, p = el;
        while (p && p !== root) { p = p.parentElement; d++; }
        hitCache.push({ el: el, l: l, t: t, r: l + el.offsetWidth, b: t + el.offsetHeight, depth: d });
      }
    }

    /**
     * fx 좌표 → root 로컬 좌표.
     * @param {number} x @param {number} y
     * @returns {{x:number,y:number}}
     */
    function toLocal(x, y) {
      return { x: x - center.x, y: y - center.y };
    }

    /**
     * 로컬 좌표에 걸리는 가장 깊은 요소를 반환 (offset 누적 rect 캐시 기반).
     * @param {number} x @param {number} y 로컬 좌표
     * @returns {Element|null}
     */
    function hit(x, y) {
      var best = null;
      for (var i = 0; i < hitCache.length; i++) {
        var c = hitCache[i];
        if (x >= c.l && x < c.r && y >= c.t && y < c.b) {
          if (!best || c.depth >= best.depth) best = c; // 동률이면 DOM 뒤쪽(나중) 우선
        }
      }
      return best ? best.el : null;
    }

    // ── 포인터 포워딩 ──
    function isTextTarget(el) {
      var tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }
    function pressTarget(el) {
      var t = el.closest('button, a, [data-cui-press]');
      return t && root.contains(t) ? t : null;
    }
    function canvasCoords(e) {
      var r = fx.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (fx.width / r.width),
        y: (e.clientY - r.top) * (fx.height / r.height),
      };
    }
    function setHover(el) {
      if (hoverEl === el) return;
      if (hoverEl) hoverEl.classList.remove('cui-hover');
      hoverEl = el;
      if (hoverEl) hoverEl.classList.add('cui-hover');
    }
    function clearActive() {
      if (activeEl) { activeEl.classList.remove('cui-active'); activeEl = null; }
    }

    function onPointerMove(e) {
      var p = canvasCoords(e);
      var local = toLocal(p.x, p.y);
      var el = hit(local.x, local.y);
      setHover(el && el !== root ? el : null);
      // 커서 모양: 실제 :hover는 canvas 위라 안 걸리므로 직접 지정
      var cur = 'default';
      if (el) {
        if (isTextTarget(el)) cur = 'text';
        else if (pressTarget(el)) cur = 'pointer';
      }
      fx.style.cursor = cur;
    }

    function onPointerDown(e) {
      e.preventDefault(); // canvas로 focus가 넘어가는 기본 동작 차단 → 진짜 요소 포커스 유지
      var p = canvasCoords(e);
      var local = toLocal(p.x, p.y);
      var el = hit(local.x, local.y);
      if (onHit && onHit(el, e, api) === true) return; // 컴포넌트가 처리 → 기본 포워딩 생략
      if (!el) {
        if (root.contains(document.activeElement)) document.activeElement.blur();
        return;
      }
      if (isTextTarget(el)) {
        el.focus(); // 이후 키보드·한글 IME는 브라우저가 처리 → 다음 프레임 촬영에 자동 반영
        try {
          var len = (el.value || '').length;
          el.setSelectionRange(len, len);
        } catch (ignored) { /* number/color 등 선택 미지원 타입 */ }
        return;
      }
      var press = pressTarget(el);
      if (press) {
        clearActive();
        activeEl = press;
        press.classList.add('cui-active');
        press.click();
        return;
      }
      if (root.contains(document.activeElement)) document.activeElement.blur();
    }

    function onPointerUp() { clearActive(); }
    function onPointerLeave() { setHover(null); clearActive(); fx.style.cursor = 'default'; }

    if (supported && interactive) {
      fx.addEventListener('pointermove', onPointerMove);
      fx.addEventListener('pointerdown', onPointerDown);
      fx.addEventListener('pointerup', onPointerUp);
      fx.addEventListener('pointerleave', onPointerLeave);
    }

    // ── 렌더 ──
    /** 1프레임 렌더 본체. rAF 루프와 requestRender()가 공용으로 사용. */
    function renderOnce(t) {
      try {
        measure();
        rebuildHitCache();
        if (onFrame) onFrame(t, api);
        // paint 이벤트 모델: 여기서는 재촬영을 '요청'만 하고, 실제 촬영(snap)은
        // src의 paint 핸들러에서 일어난다. 효과는 마지막 성공 촬영본으로 그린다.
        if (typeof src.requestPaint === 'function') src.requestPaint();
        if (!paintSeen) snap(); // paint 이벤트가 안 오는 빌드 폴백: 직접 시도
        ctx.clearRect(0, 0, fx.width, fx.height);
        if (effect) effect(ctx, src, t, api);
        else ctx.drawImage(src, center.x, center.y); // 기본: src를 중앙에 그대로
      } catch (e) {
        showError(e, 'CanvasUI 렌더');
      }
    }

    function tick(t) {
      if (destroyed) return;
      if (supported) {
        renderOnce(t);
      } else {
        // 폴백: 촬영·효과 없이 onFrame 훅만 유지 (state 갱신용)
        try { if (onFrame) onFrame(t, api); } catch (e) { showError(e, 'onFrame'); }
      }
      rafId = requestAnimationFrame(tick); // 예외가 나도 루프는 죽지 않는다
    }

    /** 즉시 1프레임 렌더 (지원 모드에서만 의미 있음). */
    function requestRender() {
      if (supported && !destroyed) renderOnce(performance.now());
    }

    /** 인스턴스 해제: 루프 중지, 리스너·DOM 제거. */
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(rafId);
      fx.removeEventListener('pointermove', onPointerMove);
      fx.removeEventListener('pointerdown', onPointerDown);
      fx.removeEventListener('pointerup', onPointerUp);
      fx.removeEventListener('pointerleave', onPointerLeave);
      fx.remove(); srcWrap.remove(); root.remove(); errBox.remove();
    }

    // ── 공개 handle(api) ──
    var api = {
      fx: fx, ctx: ctx,          // 표시 canvas / 2D 컨텍스트
      src: src, sctx: sctx,      // 소스 canvas(z-index:-1 뒤 숨김) / 컨텍스트
      root: root,                // html로 만든 루트 DOM (src의 자식)
      center: center,            // src 중앙 배치 좌상단 fx 좌표 (매 프레임 갱신)
      toLocal: toLocal,
      hit: hit,
      requestRender: requestRender,
      destroy: destroy,
      state: {},                 // 컴포넌트 자유 저장소
    };

    rafId = requestAnimationFrame(tick);
    return api;
  }

  // ── 전역 공개 ──
  window.CanvasUI = {
    supported: supported,   // 네이티브 API 존재 여부
    drawFnName: drawFnName, // 'drawElementImage' | 'drawElement' | null
    create: create,
  };
})();
