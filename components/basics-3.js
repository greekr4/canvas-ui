/**
 * basics-3 — 기초: 네이티브 위젯 4페이지
 * 브라우저만 그릴 수 있는 UI가 canvas 캡처·포워딩에서 어떻게 동작하는지 보여준다.
 * b9 네이티브 폼 위젯 / b10 아코디언·다이얼로그 / b11 contenteditable / b12 게이지·스크롤
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-basics-3';
  if (!document.getElementById(STYLE_ID)) {
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.b3-card { width: 560px; box-sizing: border-box; padding: 24px; background: var(--cui-card);',
      '  border: 1px solid var(--cui-border); border-radius: var(--cui-radius); color: var(--cui-fg);',
      '  font-family: var(--cui-font); font-size: 14px; }',
      '.b3-card h4 { margin: 0 0 14px; font-size: 15px; }',
      '.b3-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }',
      '.b3-grid label { display: block; font-size: 12px; color: var(--cui-muted); }',
      '.b3-grid select, .b3-grid input { margin-top: 4px; accent-color: var(--cui-primary); }',
      '.b3-grid select, .b3-grid input[type="date"] { width: 100%; padding: 6px 8px;',
      '  background: var(--cui-bg); color: var(--cui-fg); border: 1px solid var(--cui-border); border-radius: 8px; }',
      '.b3-inline { display: flex; gap: 14px; align-items: center; margin-top: 6px; font-size: 13px; color: var(--cui-fg); }',
      '.b3-inline label { display: flex; gap: 5px; align-items: center; white-space: nowrap; color: var(--cui-fg); }',
      /* b10 */
      '.b3-card details { border: 1px solid var(--cui-border); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }',
      '.b3-card summary { cursor: pointer; font-weight: 600; }',
      '.b3-card summary:hover, .b3-card summary.cui-hover { color: var(--cui-primary); }',
      '.b3-card details p { margin: 10px 0 4px; color: var(--cui-muted); font-size: 13px; }',
      /* UA 기본(dialog: position absolute + inset margin)을 완전히 무력화하고 in-flow 배치 */
      '.b3-card dialog { position: static; inset: auto; margin: 10px 0 0; padding: 14px;',
      '  width: 100%; max-width: none; box-sizing: border-box; height: auto;',
      '  background: var(--cui-bg); color: var(--cui-fg); border: 1px solid var(--cui-primary); border-radius: 10px; }',
      '.b3-card dialog:not([open]) { display: none; }',
      '.b3-card dialog[open] { display: block; }',
      /* b11 */
      '.b3-toolbar { display: flex; gap: 6px; margin-bottom: 10px; }',
      '.b3-editor { min-height: 120px; padding: 12px 14px; background: var(--cui-bg); border: 1px solid var(--cui-border);',
      '  border-radius: 10px; outline: none; caret-color: #fff; line-height: 1.7; }',
      '.b3-editor:focus { border-color: var(--cui-primary); }',
      /* b12 */
      '.b3-scroll { height: 150px; overflow-y: auto; border: 1px solid var(--cui-border); border-radius: 10px;',
      '  margin-top: 12px; background: var(--cui-bg); }',
      '.b3-scroll div { padding: 8px 14px; border-bottom: 1px solid var(--cui-border); font-size: 13px; }',
      '.b3-card progress, .b3-card meter { width: 100%; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  function pickerHit(el) {
    // 네이티브 픽커류: showPicker(사용자 제스처 필요)로 열고, 안 되면 focus
    if (!el) return false;
    var t = el.closest('input, select, summary');
    if (!t) return false;
    if (t.tagName === 'SUMMARY') { t.click(); return true; }
    if (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio')) { t.click(); return true; }
    if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && ['date', 'color', 'file'].indexOf(t.type) >= 0)) {
      try { t.showPicker(); } catch (e) { t.focus(); }
      return true;
    }
    return false; // 텍스트 input 등은 코어 기본 포워딩(focus)
  }

  /* ── b9. 네이티브 폼 위젯 ── */
  window.CUIDocs.register({
    id: 'b9-widgets',
    section: 'basics',
    name: '네이티브 폼 위젯',
    emoji: '🧩',
    oneLiner: 'select·date·color·file·체크박스가 캡처 속에서도 네이티브로 동작',
    code: [
      "// 체크박스·라디오는 click(), 픽커류는 showPicker()로 포워딩",
      "CanvasUI.create({ mount, html, onHit: (el) => {",
      "  const t = el && el.closest('input, select');",
      "  if (t && (t.type === 'checkbox' || t.type === 'radio')) { t.click(); return true; }",
      "  if (t) { try { t.showPicker(); } catch (e) { t.focus(); } return true; }",
      "} });",
      "// 주의: 열린 드롭다운·피커 팝업은 OS 레이어라 '캡처에는' 찍히지 않고",
      "// 실제 화면 위에 뜬다 — 선택 결과만 다음 프레임에 반영된다.",
    ].join('\n'),
    mount: function (el) {
      return CanvasUI.create({
        mount: el, width: 640, height: 360,
        html:
          '<div class="b3-card"><h4>브라우저만 그릴 수 있는 위젯들</h4><div class="b3-grid">' +
          '<label>드롭다운<select><option>서울</option><option>고양</option><option>부산</option></select></label>' +
          '<label>날짜<input type="date" value="2026-08-20"></label>' +
          '<label>색상<input type="color" value="#6366f1"></label>' +
          '<label>파일<input type="file"></label>' +
          '<label>체크박스<span class="b3-inline"><label><input type="checkbox" checked> 알림</label><label><input type="checkbox"> 메일</label></span></label>' +
          '<label>라디오<span class="b3-inline"><label><input type="radio" name="b9r" checked> 라이트</label><label><input type="radio" name="b9r"> 다크</label></span></label>' +
          '</div></div>',
        onHit: function (hitEl) { return pickerHit(hitEl); },
      });
    },
  });

  /* ── b10. 아코디언 + 다이얼로그 ── */
  window.CUIDocs.register({
    id: 'b10-disclosure',
    section: 'basics',
    name: '아코디언·다이얼로그',
    emoji: '📂',
    oneLiner: 'details 접힘/펼침과 dialog 열림이 다음 프레임에 그대로 캡처됨',
    code: [
      "// summary 클릭 포워딩 → details 토글 → 레이아웃 변화가 다음 촬영에 반영",
      "onHit: (el) => { const s = el && el.closest('summary'); if (s) { s.click(); return true; } }",
      "// dialog는 show() 사용 — showModal()은 top layer로 떠서 캡처 밖에 그려진다",
      "openBtn.onclick = () => dlg.open ? dlg.close() : dlg.show();",
    ].join('\n'),
    mount: function (el) {
      var api = CanvasUI.create({
        mount: el, width: 640, height: 520, // 아코디언 3개 + 다이얼로그 동시 오픈까지 수용
        html:
          '<div class="b3-card"><h4>상태가 있는 네이티브 콘텐츠</h4>' +
          '<details open><summary>1장. drawElementImage란</summary><p>살아있는 DOM을 canvas 픽셀로 촬영하는 API입니다.</p></details>' +
          '<details><summary>2장. paint 이벤트 모델</summary><p>촬영은 paint 핸들러 안에서만 안정적으로 동작합니다.</p></details>' +
          '<details><summary>3장. 버퍼 패턴</summary><p>소스 canvas를 찍고 표시 canvas에서 변형합니다.</p></details>' +
          '<button class="cui-btn" data-role="dlg">다이얼로그 열기/닫기</button>' +
          '<dialog>안녕하세요, 저는 canvas에 캡처된 &lt;dialog&gt;입니다.</dialog>' +
          '</div>',
        onHit: function (hitEl) { return pickerHit(hitEl); },
      });
      var dlg = api.root.querySelector('dialog');
      api.root.querySelector('[data-role="dlg"]').addEventListener('click', function () {
        if (dlg.open) dlg.close(); else dlg.show(); // show(): in-flow → 캡처됨
      });
      return api;
    },
  });

  /* ── b11. contenteditable 리치 텍스트 ── */
  window.CUIDocs.register({
    id: 'b11-editable',
    section: 'basics',
    name: 'contenteditable 편집',
    emoji: '✏️',
    oneLiner: '캔버스 속 리치 텍스트 편집 — canvas 에디터의 성배',
    code: [
      "// contenteditable은 코어 기본 포워딩 대상이 아니므로 onHit에서 직접 focus",
      "onHit: (el) => {",
      "  const ed = el && el.closest('[contenteditable]');",
      "  if (ed) { ed.focus(); return true; }",
      "};",
      "// 굵게/색상은 버튼 click 포워딩 → execCommand가 선택 영역에 적용",
      "boldBtn.onclick = () => { editor.focus(); document.execCommand('bold'); };",
    ].join('\n'),
    mount: function (el) {
      var api = CanvasUI.create({
        mount: el, width: 640, height: 330,
        html:
          '<div class="b3-card"><h4>리치 텍스트 편집기</h4>' +
          '<div class="b3-toolbar">' +
          '<button class="cui-btn cui-btn-ghost" data-cmd="bold"><b>B</b></button>' +
          '<button class="cui-btn cui-btn-ghost" data-cmd="italic"><i>I</i></button>' +
          '<button class="cui-btn cui-btn-ghost" data-cmd="underline"><u>U</u></button>' +
          '<button class="cui-btn cui-btn-ghost" data-cmd="foreColor">색상</button>' +
          '</div>' +
          '<div class="b3-editor" contenteditable="true">여기를 클릭해 <b>직접 편집</b>하세요. 한글 조합, <i>서식</i>, 줄바꿈 전부 실시간 캡처됩니다.</div>' +
          '</div>',
        onHit: function (hitEl) {
          var ed = hitEl && hitEl.closest ? hitEl.closest('[contenteditable]') : null;
          if (ed) { ed.focus(); return true; }
          return false; // 버튼은 코어 기본 press 포워딩
        },
      });
      var editor = api.root.querySelector('.b3-editor');
      var COLORS = ['#f87171', '#4ade80', '#60a5fa', '#facc15', '#e879f9'];
      var ci = 0;
      api.root.querySelectorAll('[data-cmd]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          editor.focus();
          var cmd = btn.dataset.cmd;
          if (cmd === 'foreColor') document.execCommand(cmd, false, COLORS[ci++ % COLORS.length]);
          else document.execCommand(cmd);
        });
      });
      return api;
    },
  });

  /* ── b12. 게이지 + 스크롤 컨테이너 ── */
  window.CUIDocs.register({
    id: 'b12-gauge-scroll',
    section: 'basics',
    name: '게이지·스크롤',
    emoji: '📊',
    oneLiner: 'progress·meter 게이지와 overflow 스크롤 위치까지 캡처',
    code: [
      "// 휠 이벤트를 캔버스에서 받아 진짜 스크롤 컨테이너로 전달",
      "api.fx.addEventListener('wheel', (e) => {",
      "  e.preventDefault();",
      "  scroller.scrollTop += e.deltaY; // scrollTop 변화가 다음 프레임에 캡처됨",
      "}, { passive: false });",
    ].join('\n'),
    mount: function (el) {
      var items = '';
      for (var i = 1; i <= 40; i++) items += '<div>' + i + '번째 항목 — 스크롤해서 확인</div>';
      var api = CanvasUI.create({
        mount: el, width: 640, height: 380,
        html:
          '<div class="b3-card"><h4>게이지와 스크롤</h4>' +
          '<label>progress (자동 진행)<progress max="100" value="0"></progress></label>' +
          '<label style="display:block;margin-top:10px">meter (구간 색상)<meter min="0" max="100" low="30" high="70" optimum="90" value="62"></meter></label>' +
          '<div class="b3-scroll">' + items + '</div>' +
          '</div>',
        onFrame: function (t, a) {
          a.root.querySelector('progress').value = (t / 40) % 100; // 살아있는 게이지
        },
      });
      var scroller = api.root.querySelector('.b3-scroll');
      function onWheel(e) {
        e.preventDefault();
        scroller.scrollTop += e.deltaY;
      }
      api.fx.addEventListener('wheel', onWheel, { passive: false });
      var origDestroy = api.destroy;
      api.destroy = function () {
        api.fx.removeEventListener('wheel', onWheel);
        origDestroy();
      };
      return api;
    },
  });
})();
