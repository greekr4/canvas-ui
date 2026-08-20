/**
 * basics-4 — 기초: 특수 렌더링·검증 4페이지
 * b13 비디오 프레임 / b14 반응형 리플로우 / b15 특수 텍스트 렌더링 / b16 프라이버시 실측
 * b13·b16은 "캡처가 되는지 자체가 실험 결과"인 검증 데모 — 결과를 화면에 그대로 표시한다.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-basics-4';
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.b4-card { box-sizing: border-box; padding: 24px; background: var(--cui-card);',
      '  border: 1px solid var(--cui-border); border-radius: var(--cui-radius); color: var(--cui-fg);',
      '  font-family: var(--cui-font); font-size: 14px; width: 560px; }',
      '.b4-card h4 { margin: 0 0 14px; font-size: 15px; }',
      '.b4-muted { color: var(--cui-muted); font-size: 12px; }',
      /* b13 */
      '.b4-video { display: block; width: 320px; border-radius: 10px; border: 1px solid var(--cui-border); }',
      /* b14 */
      '.b4-flow { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }',
      '.b4-flow div { height: 56px; border-radius: 10px; display: flex; align-items: center; justify-content: center;',
      '  font-size: 13px; font-weight: 600; color: #fff; }',
      /* b15 */
      '.b4-card ruby rt { color: var(--cui-primary); }',
      '.b4-card math { font-size: 20px; }',
      '.b4-steps { counter-reset: step; list-style: none; padding: 0; margin: 10px 0 0; }',
      '.b4-steps li { counter-increment: step; margin: 6px 0; }',
      '.b4-steps li::before { content: counter(step) "단계"; display: inline-block; margin-right: 8px;',
      '  padding: 1px 8px; border-radius: 999px; background: var(--cui-primary); color: #fff; font-size: 11px; }',
      '.b4-new::after { content: "NEW"; margin-left: 6px; padding: 1px 6px; border-radius: 6px;',
      '  background: #f87171; color: #fff; font-size: 10px; vertical-align: super; }',
      /* b16 */
      '.b4-probe { border: 1px dashed var(--cui-border); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }',
      '.b4-probe iframe { width: 100%; height: 60px; border: 1px solid var(--cui-border); border-radius: 8px; background: #fff; }',
      '.b4-probe a { color: #60a5fa; margin-right: 14px; }',
      '.b4-probe a:visited { color: #e879f9; }',
      '.b4-probe img { border-radius: 8px; vertical-align: middle; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ── b13. 비디오 프레임 ── */
  window.CUIDocs.register({
    id: 'b13-video',
    section: 'basics',
    name: '비디오 프레임',
    emoji: '🎞️',
    oneLiner: '재생 중인 video가 캡처되는지 실측 — 소스는 captureStream 자급자족',
    code: [
      "// 외부 파일 없이: 작은 canvas 애니메이션 → captureStream() → <video>",
      "const feed = document.createElement('canvas'); // 공 튀기기 애니메이션",
      "video.srcObject = feed.captureStream(30);",
      "video.muted = true; video.play();",
      "// 이 <video>가 layoutsubtree canvas의 자식 → drawElementImage 캡처 대상",
      "// 프레임이 보이면 비디오 캡처 지원, 검게 나오면 미지원(그 자체가 실측 결과)",
    ].join('\n'),
    mount: function (el) {
      // 비디오 소스: 자체 canvas 애니메이션 (외부 리소스 금지 규칙 준수)
      var feed = document.createElement('canvas');
      feed.width = 320; feed.height = 180;
      var fctx = feed.getContext('2d');
      var ball = { x: 60, y: 60, vx: 3.2, vy: 2.1 };
      var feedTimer = setInterval(function () {
        fctx.fillStyle = '#1d2340';
        fctx.fillRect(0, 0, 320, 180);
        ball.x += ball.vx; ball.y += ball.vy;
        if (ball.x < 14 || ball.x > 306) ball.vx *= -1;
        if (ball.y < 14 || ball.y > 166) ball.vy *= -1;
        fctx.fillStyle = '#6366f1';
        fctx.beginPath();
        fctx.arc(ball.x, ball.y, 14, 0, Math.PI * 2);
        fctx.fill();
        fctx.fillStyle = '#fff';
        fctx.font = '13px sans-serif';
        fctx.fillText(new Date().toLocaleTimeString('ko-KR'), 12, 168);
      }, 33);

      var api = CanvasUI.create({
        mount: el, width: 640, height: 320,
        html:
          '<div class="b4-card"><h4>재생 중인 &lt;video&gt;</h4>' +
          '<video class="b4-video" autoplay muted playsinline></video>' +
          '<p class="b4-muted">공이 움직이면 비디오 프레임 캡처 지원, 검은 사각형이면 미지원(실측 결과를 PITFALLS에 기록할 것).</p>' +
          '</div>',
      });
      var video = api.root.querySelector('video');
      try {
        video.srcObject = feed.captureStream(30);
        video.play().catch(function () {});
      } catch (e) {
        api.root.querySelector('.b4-muted').textContent = 'captureStream 미지원: ' + e.message;
      }
      var origDestroy = api.destroy;
      api.destroy = function () { clearInterval(feedTimer); origDestroy(); };
      return api;
    },
  });

  /* ── b14. 반응형 리플로우 ── */
  window.CUIDocs.register({
    id: 'b14-reflow',
    section: 'basics',
    name: '반응형 리플로우',
    emoji: '📐',
    oneLiner: '폭 슬라이더에 따라 Grid가 실시간 재배치 — 레이아웃 엔진을 공짜로',
    code: [
      "// root 폭을 바꾸면 auto-fill Grid가 리플로우되고,",
      "// 코어 measure()가 매 프레임 src 크기를 동기화해 그대로 캡처된다",
      "widthSlider.oninput = () => { api.root.style.width = widthSlider.value + 'px'; };",
    ].join('\n'),
    mount: function (el) {
      var cards = '';
      var COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f97316', '#22c55e', '#06b6d4', '#eab308', '#64748b'];
      for (var i = 0; i < 8; i++) {
        cards += '<div style="background:' + COLORS[i] + '">카드 ' + (i + 1) + '</div>';
      }
      return CanvasUI.create({
        mount: el, width: 680, height: 340,
        html:
          '<div class="b4-card" style="width:560px"><h4>auto-fill Grid 리플로우</h4>' +
          '<div class="b4-flow">' + cards + '</div>' +
          '<p class="b4-muted">아래 커스텀의 폭 슬라이더를 움직여 보세요.</p>' +
          '</div>',
      });
    },
    knobs: function (el, api) {
      var label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:10px;font-size:13px;color:var(--cui-muted);';
      label.textContent = '컨테이너 폭';
      var slider = document.createElement('input');
      slider.type = 'range'; slider.min = '280'; slider.max = '640'; slider.value = '560';
      slider.style.width = '240px';
      slider.addEventListener('input', function () {
        api.root.style.width = slider.value + 'px'; // 리플로우 → measure()가 src 크기 동기화
      });
      label.appendChild(slider);
      el.appendChild(label);
    },
  });

  /* ── b15. 특수 텍스트 렌더링 ── */
  window.CUIDocs.register({
    id: 'b15-text-extras',
    section: 'basics',
    name: '특수 텍스트 렌더링',
    emoji: '📖',
    oneLiner: 'ruby 독음·MathML 수식·의사요소까지 — fillText로는 못 그리는 것들',
    code: [
      "// 전부 순수 HTML/CSS — canvas 쪽 코드는 기본 캡처뿐",
      "CanvasUI.create({ mount, html: `",
      "  <ruby>韓國<rt>한국</rt></ruby>",
      "  <math><mfrac><mi>a</mi><mi>b</mi></mfrac></math>",
      "  <li>…</li>  /* counter() + ::before 배지 */",
      "` });",
    ].join('\n'),
    mount: function (el) {
      return CanvasUI.create({
        mount: el, width: 640, height: 360,
        html:
          '<div class="b4-card"><h4>브라우저 텍스트 엔진의 전문 영역</h4>' +
          '<p><b>루비 주석</b>: <ruby>韓國<rt>한국</rt></ruby> <ruby>漢字<rt>한자</rt></ruby> <ruby>讀音<rt>독음</rt></ruby></p>' +
          '<p><b>MathML</b>: <math><mrow><mi>x</mi><mo>=</mo><mfrac><mrow><mo>-</mo><mi>b</mi><mo>&#177;</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>-</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></mrow></math></p>' +
          '<p><b>의사요소</b>: <span class="b4-new">신기능 발표</span></p>' +
          '<ol class="b4-steps"><li>소스 canvas에 촬영</li><li>버퍼 패턴으로 복사</li><li>효과 적용</li></ol>' +
          '</div>',
      });
    },
  });

  /* ── b16. 프라이버시 보호 실측 ── */
  window.CUIDocs.register({
    id: 'b16-privacy',
    section: 'basics',
    name: '프라이버시 실측',
    emoji: '🔒',
    oneLiner: 'iframe·:visited·교차출처 이미지 — 스펙이 캡처에서 무엇을 빼는지 실험',
    code: [
      "// 스펙의 privacy-preserving painting이 무엇을 제외하는지 실측하는 페이지",
      "// 1) iframe(srcdoc) — 캡처에 내용이 보이는가?",
      "// 2) a:visited — 방문 링크 색이 '방문 전 색'으로 강제되는가?",
      "// 3) 교차출처 <img> — 그려지는가, 빠지는가? (canvas 오염과는 별개)",
      "// 결과가 어느 쪽이든 그 자체가 데이터 — PITFALLS.md에 기록한다",
    ].join('\n'),
    mount: function (el) {
      var api = CanvasUI.create({
        mount: el, width: 640, height: 430,
        html:
          '<div class="b4-card"><h4>캡처에서 제외되는 것 찾기</h4>' +
          '<div class="b4-probe"><b>1. iframe (srcdoc)</b>' +
          '<iframe srcdoc="&lt;body style=&quot;font-family:sans-serif;color:#111;margin:8px&quot;&gt;저는 iframe 속 문서입니다 — 캡처에 보이나요?&lt;/body&gt;"></iframe></div>' +
          '<div class="b4-probe"><b>2. :visited 링크</b> <span class="b4-muted">(방문한 링크가 보라색으로 찍히면 히스토리 유출)</span><br>' +
          '<a href="https://www.google.com">아마 방문한 링크</a>' +
          '<a href="https://example.invalid/never-visited-' + Math.floor(performance.now()) + '">방문 안 한 링크</a></div>' +
          '<div class="b4-probe"><b>3. 교차출처 이미지</b> ' +
          '<img src="https://picsum.photos/72" width="72" height="72" alt=""> ' +
          '<span class="b4-muted" data-role="img-status">로드 중…</span></div>' +
          '</div>',
      });
      var img = api.root.querySelector('img');
      var status = api.root.querySelector('[data-role="img-status"]');
      img.addEventListener('load', function () { status.textContent = '로드 성공 — 캡처에 보이는지 확인'; });
      img.addEventListener('error', function () { status.textContent = '로드 실패(오프라인?) — 이 항목은 판정 보류'; });
      return api;
    },
  });
})();
