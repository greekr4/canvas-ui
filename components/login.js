(function () {
  'use strict';

  var STYLE_ID = 'cui-style-login';

  /* ── 컴포넌트 고유 CSS (글래스모피즘 로그인 카드 + knobs) ──
     캔버스 촬영 대상이므로 :hover와 .cui-hover를 함께 선언한다(코어 규칙). */
  var css = '' +
    '.login-card {' +
    '  width: 336px; box-sizing: border-box; padding: 32px;' +
    '  background: color-mix(in srgb, var(--cui-card) 72%, transparent);' + /* 반투명 글래스 */
    '  border: 1px solid rgba(255, 255, 255, 0.10);' +
    '  border-radius: 16px;' +
    '  box-shadow: var(--cui-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.06);' +
    '}' +
    '.login-title { font-size: 20px; font-weight: 700; }' +
    '.login-sub { font-size: 13px; color: var(--cui-muted); margin: 8px 0 24px; }' +
    '.login-field { margin-bottom: 16px; }' +
    '.login-card .cui-input { background: color-mix(in srgb, var(--cui-bg) 60%, transparent); }' +
    '.login-error { display: none; font-size: 13px; color: #f87171; margin: -8px 0 16px; }' +
    '.login-error.show { display: block; }' +
    '.login-btn { width: 100%; padding: 10px 16px; margin-top: 8px; }' +
    '.login-demo { margin-top: 16px; font-size: 12px; color: var(--cui-muted); text-align: center; }' +
    '.login-demo code {' +
    '  background: rgba(255, 255, 255, 0.06); border: 1px solid var(--cui-border);' +
    '  padding: 2px 6px; border-radius: 4px; font-size: 12px;' +
    '}' +
    /* 환영 상태 */
    '.login-welcome { display: none; text-align: center; padding: 24px 0; }' +
    '.login-welcome.show { display: block; }' +
    '.welcome-mark {' +
    '  width: 48px; height: 48px; line-height: 48px; margin: 0 auto 16px;' +
    '  border-radius: 999px; background: color-mix(in srgb, var(--cui-primary) 18%, transparent);' +
    '  border: 1px solid var(--cui-primary); color: var(--cui-primary);' +
    '  font-size: 22px; font-weight: 700; text-align: center;' +
    '}' +
    '.welcome-title { font-size: 20px; font-weight: 700; margin-bottom: 8px; }' +
    '.welcome-sub { font-size: 13px; color: var(--cui-muted); margin-bottom: 24px; }' +
    /* knobs */
    '.login-knobs { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }' +
    '.login-knobs .ctl label { display: block; font-size: 13px; color: var(--cui-muted); margin-bottom: 8px; }' +
    '.login-knobs .ctl input[type="range"] { width: 100%; accent-color: var(--cui-primary); }' +
    '.login-knobs .ctl input[type="color"] {' +
    '  width: 48px; height: 28px; padding: 0; border: 1px solid var(--cui-border);' +
    '  border-radius: 6px; background: var(--cui-bg); cursor: pointer;' +
    '}' +
    '.login-knobs .ctl .val { font-size: 12px; color: var(--cui-muted); margin-left: 8px; }' +
    /* 기본형: 글래스 대신 플레인 카드 (.cui 토큰만 사용) */
    '.login-plain {' +
    '  background: var(--cui-card); border: 1px solid var(--cui-border);' +
    '  border-radius: var(--cui-radius); box-shadow: var(--cui-shadow);' +
    '}' +
    '.login-plain .cui-input { background: var(--cui-bg); }' +
    '.login-plain .login-demo code { background: var(--cui-bg); }';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return; // 중복 주입 가드
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  var loginHtml =
    '<div class="login-card">' +
      '<div class="lg-form">' +
        '<div class="login-title">로그인</div>' +
        '<div class="login-sub">CanvasUI 계정으로 계속하기</div>' +
        '<div class="login-field">' +
          '<label class="cui-label" for="lg-email">이메일</label>' +
          '<input class="cui-input" id="lg-email" type="email" placeholder="you@example.com" autocomplete="off">' +
        '</div>' +
        '<div class="login-field">' +
          '<label class="cui-label" for="lg-pw">비밀번호</label>' +
          '<input class="cui-input" id="lg-pw" type="password" placeholder="••••••••">' +
        '</div>' +
        '<div class="login-error">비밀번호가 올바르지 않습니다</div>' +
        '<button class="cui-btn login-btn" type="button">로그인</button>' +
      '</div>' +
      '<div class="login-welcome">' +
        '<div class="welcome-mark">✓</div>' +
        '<div class="welcome-title">환영합니다</div>' +
        '<div class="welcome-sub">로그인이 완료되었습니다.</div>' +
        '<button class="cui-btn cui-btn-ghost" type="button" data-role="reset">다시 로그인</button>' +
      '</div>' +
    '</div>';

  /** hex(#rrggbb) → "r,g,b" 문자열 */
  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }

  /** el의 중심을 root 로컬 좌표로 계산 (코어 hit 캐시와 같은 offset 누적 방식) */
  function localCenter(el, root) {
    var l = 0, t = 0, n = el;
    while (n && n !== root) { l += n.offsetLeft; t += n.offsetTop; n = n.offsetParent; }
    return { x: l + el.offsetWidth / 2, y: t + el.offsetHeight / 2 };
  }

  /** 부드러운 라디얼 글로우 1개 */
  function glow(ctx, x, y, r, rgb, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  var mountEl = null; // knobs에서 --cui-primary를 걸 대상 (원본: previewMount)

  var codeExample = [
    "const login = CanvasUI.create({",
    "  mount: el,",
    "  width: 560, height: 520,",
    "  html: '<div class=\"login-card\">…이메일/비밀번호/버튼…</div>',",
    "  onFrame: (t, api) => {",
    "    const s = api.state;",
    "    // 포커스 필드 중심으로 스포트라이트 위치 보간",
    "    // 성공 시 scale 1.05, 평상시 1.0 복귀",
    "  },",
    "  effect: (ctx, src, t, api) => {",
    "    // 버퍼 패턴: 소스 canvas(src)를 변형해 표시 canvas에 그린다",
    "    // 1) 앰비언트 배경 글로우",
    "    // 2) 실패 셰이크: translate X에 감쇠 사인파 (500ms)",
    "    ctx.translate(api.fx.width / 2 + shakeX, api.fx.height / 2);",
    "    ctx.scale(api.state.scale, api.state.scale);",
    "    // 3) 카드 뒤 스포트라이트 글로우 → 카드 → 상단 하이라이트(lighter)",
    "    ctx.drawImage(src, -src.width / 2, -src.height / 2);",
    "    // 4) 실패 빨간 플래시: 카드 영역 roundRect 오버레이 (450ms)",
    "    // 5) 성공 빛 퍼짐: 중심에서 퍼지는 링 (900ms, lighter)",
    "  },",
    "});",
    "// 로그인하면 성공 → 카드 확대 + 빛 퍼짐 + 파티클 폭죽",
    "// 틀리면 셰이크 + 빨간 플래시 + 에러 메시지",
  ].join('\n');

  // ── 확장형: 기존 스포트라이트/셰이크/성공 연출 그대로 ──
  var extendedVariant = {
    id: 'extended',
    name: '확장형',
    code: codeExample,

    mount: function (el) {
      injectStyle();
      mountEl = el;

      var login = CanvasUI.create({
        mount: el,
        width: 560,
        height: 520,
        html: loginHtml,

        /** 매 프레임: 스포트라이트 위치·스케일·플래시 값 보간 (effect 앞에 실행) */
        onFrame: function (t, api) {
          var s = api.state;
          // 스포트라이트 목표 위치: 포커스된 필드 중심
          if (s.focusEl && s.focusEl.isConnected) {
            var c = localCenter(s.focusEl, api.root);
            if (s.spotX === null) { s.spotX = c.x; s.spotY = c.y; }
            s.spotX += (c.x - s.spotX) * 0.18;
            s.spotY += (c.y - s.spotY) * 0.18;
            s.spotA += (1 - s.spotA) * 0.12;
          } else {
            s.spotA += (0 - s.spotA) * 0.12;
          }
          // 성공 시 카드 확대(부드럽게), 평상시 1.0 복귀
          var target = s.success ? 1.05 : 1.0;
          s.scale += (target - s.scale) * 0.08;
          // 파티클 진행 (중력 + 감쇠)
          var ps = s.particles;
          for (var i = 0; i < ps.length; i++) {
            var p = ps[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += 0.12; p.vx *= 0.99;
            p.life -= 0.014;
          }
          s.particles = ps.filter(function (p) { return p.life > 0; });
        },

        /** 버퍼 패턴: src(살아있는 DOM 촬영본)를 변형해 fx에 그린다 */
        effect: function (ctx, src, t, api) {
          var s = api.state;
          var W = api.fx.width, H = api.fx.height;
          var hw = src.width / 2, hh = src.height / 2;

          // 은은한 앰비언트 배경 (글래스 카드가 비쳐 보이는 바탕)
          glow(ctx, W * 0.30 + Math.sin(t * 0.0003) * 24, H * 0.32, 240, s.spotColor, 0.08);
          glow(ctx, W * 0.74, H * 0.72 + Math.cos(t * 0.00025) * 24, 220, '56,189,248', 0.05);

          // 실패 셰이크 (500ms 감쇠)
          var shakeX = 0;
          if (s.failT) {
            var fd = t - s.failT;
            if (fd < 500) shakeX = Math.sin(fd * 0.09) * s.shakeStrength * (1 - fd / 500);
            else s.failT = 0;
          }

          ctx.save();
          ctx.translate(W / 2 + shakeX, H / 2);
          ctx.scale(s.scale, s.scale);

          // 스포트라이트: 카드 뒤에서 포커스 필드를 따라다니는 글로우
          if (s.spotA > 0.01 && s.spotX !== null) {
            glow(ctx, s.spotX - hw, s.spotY - hh, 110, s.spotColor, 0.55 * s.spotA * s.spotIntensity);
          }

          ctx.drawImage(src, -hw, -hh);

          // 스포트라이트 상단 하이라이트 (유리에 빛이 얹힌 느낌, 아주 약하게)
          if (s.spotA > 0.01 && s.spotX !== null) {
            ctx.globalCompositeOperation = 'lighter';
            glow(ctx, s.spotX - hw, s.spotY - hh, 70, s.spotColor, 0.10 * s.spotA * s.spotIntensity);
            ctx.globalCompositeOperation = 'source-over';
          }

          // 실패 빨간 플래시: 카드 영역 오버레이 (450ms 감쇠)
          if (s.flashT) {
            var pd = t - s.flashT;
            if (pd < 450) {
              var a = (1 - pd / 450) * 0.22;
              ctx.fillStyle = 'rgba(239,68,68,' + a + ')';
              if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(-hw, -hh, src.width, src.height, 16);
                ctx.fill();
              } else {
                ctx.fillRect(-hw, -hh, src.width, src.height);
              }
            } else s.flashT = 0;
          }
          ctx.restore();

          // 성공 빛 퍼짐: 카드 중심에서 퍼지는 링 (900ms)
          if (s.burstT) {
            var bd = t - s.burstT;
            if (bd < 900) {
              var p = bd / 900;
              var r = 60 + p * 320;
              ctx.globalCompositeOperation = 'lighter';
              glow(ctx, W / 2, H / 2, r, s.spotColor, (1 - p) * 0.35);
              ctx.globalCompositeOperation = 'source-over';
            } else s.burstT = 0;
          }

          // 성공 파티클 폭죽 (화면 공간)
          var ps2 = s.particles;
          for (var pi = 0; pi < ps2.length; pi++) {
            var pt = ps2[pi];
            ctx.globalAlpha = Math.max(0, Math.min(1, pt.life));
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        },
      });

      // ── 컴포넌트 상태 초기화 ──
      var s = login.state;
      s.focusEl = null;
      s.spotX = null; s.spotY = null; s.spotA = 0;
      s.scale = 1; s.success = false;
      s.failT = 0; s.flashT = 0; s.burstT = 0;
      s.particles = [];
      s.spotColor = hexToRgb('#6366f1');
      s.spotIntensity = 0.8;
      s.shakeStrength = 10;

      // ── 컴포넌트 고유 로직 (포워딩·촬영은 코어가 처리, 여기선 진짜 DOM 이벤트만) ──
      var root = login.root;
      var emailInput = root.querySelector('#lg-email');
      var pwInput = root.querySelector('#lg-pw');
      var loginBtn = root.querySelector('.login-btn');
      var errMsg = root.querySelector('.login-error');
      var formBox = root.querySelector('.lg-form');
      var welcomeBox = root.querySelector('.login-welcome');
      var resetBtn = root.querySelector('[data-role="reset"]');

      // 포커스 추적 → 스포트라이트 목표 (코어가 pointerdown을 focus()로 포워딩해준다)
      root.addEventListener('focusin', function (e) {
        if (e.target === emailInput || e.target === pwInput) s.focusEl = e.target;
      });
      root.addEventListener('focusout', function (e) {
        if (e.target === s.focusEl) s.focusEl = null;
      });

      var PARTICLE_COLORS = ['#6366f1', '#8b5cf6', '#4ade80', '#facc15', '#38bdf8', '#f472b6'];
      function spawnParticles() {
        var cx = login.fx.width / 2, cy = login.fx.height / 2;
        for (var i = 0; i < 90; i++) {
          var ang = Math.random() * Math.PI * 2;
          var sp = 2 + Math.random() * 7;
          s.particles.push({
            x: cx, y: cy,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp - 2.5,
            r: 2 + Math.random() * 3,
            life: 0.9 + Math.random() * 0.5,
            color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
          });
        }
      }

      function attemptLogin() { // 데모: 아무 값이나 입력해도 성공
        if (s.success) return;
        s.success = true;
        s.burstT = performance.now();
        spawnParticles();
        s.focusEl = null;
        errMsg.classList.remove('show');
        formBox.style.display = 'none';
        welcomeBox.classList.add('show'); // DOM 변경은 다음 프레임 촬영에 자동 반영
      }

      function resetForm() {
        s.success = false;
        s.burstT = 0;
        s.particles = [];
        pwInput.value = '';
        errMsg.classList.remove('show');
        welcomeBox.classList.remove('show');
        formBox.style.display = '';
      }

      loginBtn.addEventListener('click', attemptLogin);
      resetBtn.addEventListener('click', resetForm);
      pwInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') attemptLogin();
      });
      emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') pwInput.focus();
      });
      pwInput.addEventListener('input', function () { errMsg.classList.remove('show'); });

      return login;
    },

    knobs: function (el, api) {
      var s = api.state;
      el.innerHTML =
        '<div class="login-knobs">' +
          '<div class="ctl">' +
            '<label for="lg-ctl-primary">포인트 컬러</label>' +
            '<input type="color" id="lg-ctl-primary" value="#6366f1">' +
          '</div>' +
          '<div class="ctl">' +
            '<label for="lg-ctl-spot-color">스포트라이트 색상</label>' +
            '<input type="color" id="lg-ctl-spot-color" value="#6366f1">' +
          '</div>' +
          '<div class="ctl">' +
            '<label for="lg-ctl-spot">스포트라이트 세기<span class="val" id="lg-ctl-spot-val">0.8</span></label>' +
            '<input type="range" id="lg-ctl-spot" min="0" max="1" step="0.05" value="0.8">' +
          '</div>' +
          '<div class="ctl">' +
            '<label for="lg-ctl-shake">셰이크 강도<span class="val" id="lg-ctl-shake-val">10</span></label>' +
            '<input type="range" id="lg-ctl-shake" min="0" max="20" step="1" value="10">' +
          '</div>' +
        '</div>';

      el.querySelector('#lg-ctl-primary').addEventListener('input', function (e) {
        if (mountEl) mountEl.style.setProperty('--cui-primary', e.target.value);
      });
      el.querySelector('#lg-ctl-spot-color').addEventListener('input', function (e) {
        s.spotColor = hexToRgb(e.target.value);
      });
      el.querySelector('#lg-ctl-spot').addEventListener('input', function (e) {
        s.spotIntensity = parseFloat(e.target.value);
        el.querySelector('#lg-ctl-spot-val').textContent = e.target.value;
      });
      el.querySelector('#lg-ctl-shake').addEventListener('input', function (e) {
        s.shakeStrength = parseInt(e.target.value, 10);
        el.querySelector('#lg-ctl-shake-val').textContent = e.target.value;
      });
    },
  };

  window.CUIDocs.register({
    id: 'login',
    name: '로그인 화면',
    emoji: '🔐',
    section: 'components',
    oneLiner: '포커스 필드를 따라다니는 스포트라이트 글래스 로그인 카드',
    code: extendedVariant.code,
    mount: extendedVariant.mount,
    knobs: extendedVariant.knobs,
  });
})();
