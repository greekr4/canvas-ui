/**
 * 스킬 (AI용) — SKILL.md 내용을 내장해 렌더하는 문서 페이지.
 * file:// 환경에서는 fetch가 불가하므로 본문을 JS 문자열로 내장한다.
 * (원본: /Users/tk/Desktop/project/canvas-ui/SKILL.md — 수정 시 양쪽 동기화)
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-skill-page';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.skp-doc { max-width: 860px; line-height: 1.75; font-size: 15px; }',
      '.skp-doc h2 { margin: 28px 0 12px; font-size: 22px; }',
      '.skp-doc h3 { margin: 22px 0 8px; font-size: 17px; }',
      '.skp-doc p { margin: 8px 0; }',
      '.skp-doc ul, .skp-doc ol { margin: 8px 0; padding-left: 22px; }',
      '.skp-doc li { margin: 4px 0; }',
      '.skp-doc code { padding: 1px 5px; border-radius: 4px; background: rgba(127,127,127,.18); font-family: ui-monospace, monospace; font-size: .9em; }',
      '.skp-doc pre { margin: 10px 0; padding: 12px 14px; border-radius: 8px; background: rgba(127,127,127,.12); overflow-x: auto; }',
      '.skp-doc pre code { padding: 0; background: none; font-size: 13px; line-height: 1.6; }',
      '.skp-doc blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid rgba(127,127,127,.5); background: rgba(127,127,127,.08); border-radius: 0 6px 6px 0; }',
      '.skp-doc .skp-table-wrap { overflow-x: auto; margin: 10px 0; }',
      '.skp-doc table { border-collapse: collapse; min-width: 420px; }',
      '.skp-doc th, .skp-doc td { padding: 6px 12px; border: 1px solid rgba(127,127,127,.35); text-align: left; }',
      '.skp-doc th { background: rgba(127,127,127,.14); }',
      '.skp-doc a { color: #4a6cf7; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  // ── SKILL.md 본문 (frontmatter 제외, 내용 동일) ──
  var MD = [
    "# HTML-in-Canvas 스킬 (AI 에이전트용)",
    "",
    "살아있는 DOM(`<input>`, `<button>` 등)을 canvas 픽셀로 촬영해 자유 변형하는 실험 API(`ctx.drawElementImage`)를 다루기 위한 지식 패키지.",
    "",
    "> 검증일: **2026-08-20** — Chrome Canary(`chrome://flags/#canvas-draw-element` Enabled)에서 실검증.",
    "> 실험 API라 빌드마다 함수 이름·시그니처·동작이 다르다. 아래 규칙은 전부 실제 실패 사례에서 나온 것이다.",
    "",
    "## 핵심 규칙 요약",
    "",
    "| 규칙 | 위반 시 증상 |",
    "|---|---|",
    "| paint 이벤트 핸들러 안에서만 촬영 | \"No cached paint record\" 예외 |",
    "| 시그니처 3종 순차 try + 에러 전체 나열 | 진짜 원인이 마지막 에러에 가려짐 |",
    "| 소스 숨김은 z-index:-1 겹침만 | 투명(빈) 촬영 |",
    "| rAF 루프 전체 try/catch + 화면 에러 박스 | 조용히 멈춘 캔버스 |",
    "| getImageData / toDataURL 금지 | SecurityError |",
    "| 버퍼 패턴 (소스 촬영 → 표시 변형) | 변형·히트테스트 어긋남 |",
    "| 실험 API 전부 감지 가드 뒤에 | 미지원 브라우저에서 페이지 전체 사망 |",
    "",
    "## 핵심 규칙 상세",
    "",
    "### 1. paint 이벤트 촬영 모델 — 최중요 함정 (이번에 실검증)",
    "",
    "촬영(`drawElementImage` 호출)은 **소스 canvas의 `paint` 이벤트 핸들러 안**에서만 안정적으로 성공한다. rAF 등 다른 타이밍에서는 `src.requestPaint?.()`로 재촬영을 **요청만** 하고, 실제 촬영은 paint 핸들러에 맡긴다. rAF 직접 촬영은 paint 이벤트가 안 오는 빌드용 폴백으로만 유지한다. 효과 그리기는 마지막 성공 촬영본으로 한다.",
    "",
    "- **위반 시 증상**: `\"No cached paint record\"` 예외. 브라우저가 페인트 기록을 캐시한 시점 밖에서 촬영하면 간헐적 또는 전면 실패한다. 이번 검증에서 실제로 맞은 에러다.",
    "",
    "### 2. 시그니처 3종 호환 호출",
    "",
    "`(el, x, y)` → `(el, x, y, w, h)` → `(el)` 순서로 순차 try 한다. **실패하면 세 시도의 에러를 전부 모아 나열**한다.",
    "",
    "- **위반 시 증상**: 마지막 시도의 에러만 남아 진짜 원인이 가려진다. 특정 빌드에서만 TypeError가 난다.",
    "",
    "### 3. 소스 숨김은 z-index:-1 겹침만",
    "",
    "`position:absolute; z-index:-1`로 표시 canvas 뒤에 겹쳐 숨긴다. `display:none`, `visibility:hidden`, `left:-9999px` 전부 금지.",
    "",
    "- **위반 시 증상**: 브라우저가 페인트를 생략해 **투명(빈) 촬영**이 된다.",
    "",
    "### 4. rAF 루프 전체 try/catch + 화면 에러",
    "",
    "루프 본체를 통째로 try/catch로 감싸고, 예외는 페이지 내 에러 박스에 표시하며, 루프는 계속 돌린다.",
    "",
    "- **위반 시 증상**: file:// 데모처럼 콘솔을 안 보는 환경에서 조용히 멈춘 캔버스만 남는다.",
    "",
    "### 5. getImageData / toDataURL 절대 금지",
    "",
    "`drawElementImage`로 그린 canvas는 오염(tainted) 상태다.",
    "",
    "- **위반 시 증상**: 호출 즉시 `SecurityError`.",
    "",
    "### 6. 버퍼 패턴",
    "",
    "소스 canvas(`layoutsubtree` 속성, root DOM을 자식으로 소유)에 촬영하고, 표시(fx) canvas에 `drawImage`로 변형 복사한다.",
    "",
    "- **위반 시 증상**: paint 핸들러 타이밍과 효과 타이밍이 엉켜 변형과 히트테스트가 어긋난다.",
    "",
    "### 7. 감지 가드",
    "",
    "모든 실험 API는 존재 확인 뒤에만 호출한다: `['drawElementImage', 'drawElement']` 순서로 탐색하고, `requestPaint`·`reset`도 `typeof` 확인. 미지원이면 데모 대신 요구 사항 안내만 표시한다 (DOM 폴백 없음).",
    "",
    "- **위반 시 증상**: 일반 브라우저에서 TypeError로 페이지 전체가 죽는다.",
    "",
    "## CanvasUI 코어 사용법 (core/canvas-ui.js)",
    "",
    "코어가 위 규칙 전부(API 감지, paint 촬영 모델, 호환 호출, z-index:-1 숨김, 에러 가시화, 포인터 포워딩, 폴백)를 내장한다. **컴포넌트는 코어만 쓰면 된다.** 자체 구현은 코어를 못 쓰는 특수 데모(WebGL/WebGPU 텍스처 등)에서만 하고, 그때도 위 규칙을 그대로 적용한다.",
    "",
    "전역은 `window.CanvasUI = { supported, drawFnName, create }` 하나다.",
    "",
    "```js",
    "var api = CanvasUI.create({",
    "  mount: '#demo',                    // 컨테이너 (요소 또는 셀렉터)",
    "  html: '<div class=\"cui-card\">…</div>', // 컴포넌트 마크업 (루트 요소 1개 필수)",
    "  width: 480, height: 320,           // fx canvas 버퍼 크기",
    "  effect: function (ctx, src, t, api) {  // 생략 시 src를 중앙에 그대로 그림",
    "    ctx.drawImage(src, api.center.x, api.center.y + Math.sin(t / 300) * 4);",
    "  },",
    "  interactive: true,                 // 포인터 포워딩 (기본 true)",
    "  onFrame: function (t, api) {},     // 매 프레임, effect 앞 (물리·파티클용)",
    "  onHit: function (el, ev, api) {},  // pointerdown 훅. true 반환 시 기본 포워딩 생략",
    "});",
    "```",
    "",
    "반환 handle(api):",
    "",
    "| 필드 | 의미 |",
    "|---|---|",
    "| `fx`, `ctx` | 표시 canvas와 2D 컨텍스트 (효과를 그리는 곳) |",
    "| `src`, `sctx` | 소스 canvas(z-index:-1 뒤 숨김)와 컨텍스트 |",
    "| `root` | html로 만든 살아있는 루트 DOM (src의 자식) |",
    "| `center` | src 중앙 배치 좌상단 fx 좌표 (매 프레임 갱신) |",
    "| `toLocal(x, y)` | fx 좌표 → root 로컬 좌표 |",
    "| `hit(x, y)` | 로컬 좌표에 걸리는 가장 깊은 요소 |",
    "| `requestRender()` | 즉시 1프레임 렌더 |",
    "| `destroy()` | 루프 중지 + 리스너·DOM 제거 |",
    "| `state` | 컴포넌트 자유 저장소 (빈 객체) |",
    "",
    "미지원 브라우저에서는 root DOM이 그대로 표시되고 effect만 꺼진다. 코어가 페이지 상단에 지원/미지원 배지를 1회 삽입한다.",
    "",
    "## 폴리필 결정트리",
    "",
    "```",
    "ctx.drawElementImage / drawElement 있음?",
    "├─ 예 → 네이티브 사용 + 이 스킬의 규칙 준수 (CanvasUI 코어 권장)",
    "└─ 아니오",
    "   ├─ 살아있는 상호작용(입력·IME·포커스) 필수",
    "   │   → 플래그 안내 표시 (Chromium 146 이상 + canvas-draw-element)",
    "   └─ 시각 재현만 필요 (3D 텍스처 등)",
    "       → three-html-render 등 SVG foreignObject 직렬화 폴리필",
    "         · 스냅샷 기반: 입력 상태·IME·:hover 미반영",
    "         · 크로스오리진 이미지·폰트 제약 있음",
    "```",
    "",
    "## 상호작용 3단계 (canvas 위 클릭을 진짜 DOM에 전달)",
    "",
    "1. **좌표 변환**: 포인터 이벤트 → fx canvas 버퍼 좌표(`getBoundingClientRect` 비율 보정) → root 로컬 좌표(`center` 빼기).",
    "2. **히트테스트**: root 하위 전 요소의 offset 누적 rect를 캐시해 두고, 좌표에 걸리는 가장 깊은 요소를 고른다. canvas 위라 `elementFromPoint`는 못 쓴다.",
    "3. **포워딩**: input/textarea/select는 `focus()` — 이후 키보드·한글 IME는 브라우저가 처리하고 다음 촬영에 자동 반영된다. button/a는 `.click()` + active 클래스. `:hover`가 canvas에 안 걸리므로 hover 클래스와 `style.cursor`를 직접 지정한다. pointerdown에서 `preventDefault()`로 canvas가 포커스를 뺏는 것을 차단한다.",
  ].join('\n');

  // ── 초경량 마크다운 렌더 (h1~h3·코드블록·표·인용·목록·문단 수준만) ──
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function inline(s) {
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, function (m, c) { return '<code>' + c + '</code>'; });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
    return s;
  }
  function mdToHtml(md) {
    var lines = md.split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var ln = lines[i];

      if (ln.indexOf('```') === 0) { // 코드블록
        var code = [];
        i++;
        while (i < lines.length && lines[i].indexOf('```') !== 0) { code.push(lines[i]); i++; }
        i++; // 닫는 펜스
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      if (ln.charAt(0) === '|') { // 표
        var rows = [];
        while (i < lines.length && lines[i].charAt(0) === '|') { rows.push(lines[i]); i++; }
        var html = ['<div class="skp-table-wrap"><table>'];
        for (var r = 0; r < rows.length; r++) {
          if (/^\|[\s\-:|]+\|$/.test(rows[r])) continue; // 구분선 행
          var cells = rows[r].replace(/^\||\|$/g, '').split('|');
          var tag = r === 0 ? 'th' : 'td';
          html.push('<tr>');
          for (var c = 0; c < cells.length; c++) {
            html.push('<' + tag + '>' + inline(cells[c].trim()) + '</' + tag + '>');
          }
          html.push('</tr>');
        }
        html.push('</table></div>');
        out.push(html.join(''));
        continue;
      }
      if (ln.indexOf('> ') === 0) { // 인용
        var q = [];
        while (i < lines.length && lines[i].indexOf('> ') === 0) { q.push(inline(lines[i].slice(2))); i++; }
        out.push('<blockquote>' + q.join('<br>') + '</blockquote>');
        continue;
      }
      if (ln.indexOf('- ') === 0) { // 목록
        var ul = [];
        while (i < lines.length && lines[i].indexOf('- ') === 0) { ul.push('<li>' + inline(lines[i].slice(2)) + '</li>'); i++; }
        out.push('<ul>' + ul.join('') + '</ul>');
        continue;
      }
      if (/^\d+\. /.test(ln)) { // 번호 목록
        var ol = [];
        while (i < lines.length && /^\d+\. /.test(lines[i])) {
          ol.push('<li>' + inline(lines[i].replace(/^\d+\. /, '')) + '</li>');
          i++;
        }
        out.push('<ol>' + ol.join('') + '</ol>');
        continue;
      }
      if (ln.indexOf('### ') === 0) { out.push('<h3>' + inline(ln.slice(4)) + '</h3>'); i++; continue; }
      if (ln.indexOf('## ') === 0) { out.push('<h2>' + inline(ln.slice(3)) + '</h2>'); i++; continue; }
      if (ln.indexOf('# ') === 0) { out.push('<h2>' + inline(ln.slice(2)) + '</h2>'); i++; continue; }
      if (ln.trim() === '') { i++; continue; }
      out.push('<p>' + inline(ln) + '</p>');
      i++;
    }
    return out.join('\n');
  }

  window.CUIDocs.register({
    id: 'skill',
    name: '스킬 (AI용)',
    emoji: '🤖',
    section: 'start',
    oneLiner: '이 API를 쓰면서 겪은 문제와 해결법 정리',
    renderDoc: function (el) {
      ensureStyle();
      var doc = document.createElement('div');
      doc.className = 'skp-doc';
      doc.innerHTML = mdToHtml(MD);
      el.appendChild(doc);
    },
  });
})();
