/**
 * official-webgl-cube — WICG 공식 데모(Examples/webGL.html) 이식
 *
 * 원본 메커니즘 (충실도 우선):
 *  - WebGL canvas 자체에 layoutsubtree 부여, HTML(div, inert)을 canvas의 자식으로 소유
 *  - gl.texElementImage2D로 HTML 요소를 직접 WebGL 텍스처에 업로드
 *    (신형 (target, internalFormat, el) → 구형 (target, level, internalFormat,
 *     srcFormat, destType, el) 순차 시도 — 원본의 try/catch 폴백 그대로)
 *  - 텍스처 업로드는 canvas의 paint 이벤트 안에서만, rAF에서는 requestPaint 요청만
 *  - gl.pixelStorei(UNPACK_FLIP_Y_WEBGL, true)
 * 원본과 다른 점: gl-matrix CDN 의존을 제거하고 최소 mat4 구현 내장(외부 CDN 금지),
 * texElementImage2D 미지원 시 2D drawElementImage 캡처 → texImage2D 업로드 폴백.
 */
(function () {
  'use strict';

  var STYLE_ID = 'cui-style-official-webgl-cube';
  var CSS =
    '.owc-wrap { position: relative; }' +
    '.owc-gl { display: block; border-radius: 12px; background: #0b0e14; max-width: 100%; }' +
    '.owc-src-wrap { position: absolute; left: 0; top: 0; z-index: -1; overflow: hidden; }' +
    '.owc-el {' +
    '  width: 300px; padding: 14px; box-sizing: border-box;' +
    '  background: linear-gradient(160deg, #fdf6e3 0%, #ffe9c2 100%);' +
    '  color: #1f2430; font-size: 15px; line-height: 1.6;' +
    '  border: 2px solid #d9b45b; border-radius: 8px;' +
    '}' +
    '.owc-el b { color: #b4231f; }' +
    '.owc-el .owc-vert { writing-mode: vertical-rl; margin: 4px 0; display: inline-block; height: 70px; }' +
    '.owc-note { margin: 8px 0 0; font-size: 12px; color: #8a8f9d; }' +
    '.owc-error {' +
    '  display: none; margin-top: 8px; padding: 10px 12px;' +
    '  background: #3a1214; color: #ffb4b4; border-radius: 8px;' +
    '  font-size: 12px; white-space: pre-wrap; font-family: monospace;' +
    '}' +
    '.owc-dom-fallback { position: static !important; z-index: auto !important; }';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // 원본 데모의 HTML 콘텐츠 (외부 이미지 wolf.jpg만 인라인 SVG로 대체)
  var CONTENT_HTML =
    '<div class="owc-el" inert>' +
    '  안녕하세요! 저는 여러 줄의 <b>서식 있는</b> 텍스트입니다.' +
    '  이모지(&#128512;), RTL 텍스트' +
    '  <span dir="rtl">من فارسی صحبت میکنم</span>,' +
    '  세로쓰기 <span class="owc-vert">这是垂直文本</span>,' +
    '  그리고 인라인 SVG' +
    '  <svg width="44" height="44" style="vertical-align:middle">' +
    '    <circle cx="22" cy="22" r="19" fill="green"></circle>' +
    '    <text x="22" y="27" font-size="13" text-anchor="middle" fill="#fff">SVG</text>' +
    '  </svg> 까지 WebGL 큐브 텍스처가 됩니다!' +
    '</div>';

  // ── 최소 mat4 (column-major) — 원본의 gl-matrix CDN 대체 ──
  function mat4Perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  }
  function mat4Multiply(a, b) {
    var out = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }
  function mat4Translate(x, y, z) {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  }
  function mat4RotX(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  }
  function mat4RotY(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  }
  function mat4RotZ(a) {
    var c = Math.cos(a), s = Math.sin(a);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }

  // ── 셰이더 (원본과 동일한 소스) ──
  var VS =
    'attribute vec4 aVertexPosition;\n' +
    'attribute vec2 aTextureCoord;\n' +
    'uniform mat4 uModelViewMatrix;\n' +
    'uniform mat4 uProjectionMatrix;\n' +
    'varying highp vec2 vTextureCoord;\n' +
    'void main(void) {\n' +
    '  gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;\n' +
    '  vTextureCoord = aTextureCoord;\n' +
    '}';
  var FS =
    'varying highp vec2 vTextureCoord;\n' +
    'uniform sampler2D uSampler;\n' +
    'void main(void) {\n' +
    '  gl_FragColor = texture2D(uSampler, vTextureCoord);\n' +
    '}';

  function initShaderProgram(gl, vsSource, fsSource) {
    function compile(type, source) {
      var sh = gl.createShader(type);
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error('셰이더 컴파일 실패: ' + gl.getShaderInfoLog(sh));
      }
      return sh;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('프로그램 링크 실패: ' + gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  function initBuffers(gl) {
    var positions = [
      // 앞
      -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
      // 뒤
      -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1, -1,
      // 위
      -1, 1, -1, -1, 1, 1, 1, 1, 1, 1, 1, -1,
      // 아래
      -1, -1, -1, 1, -1, -1, 1, -1, 1, -1, -1, 1,
      // 오른쪽
      1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1,
      // 왼쪽
      -1, -1, -1, -1, -1, 1, -1, 1, 1, -1, 1, -1,
    ];
    var texCoords = [];
    for (var f = 0; f < 6; f++) texCoords.push(0, 0, 1, 0, 1, 1, 0, 1);
    var indices = [];
    for (var i = 0; i < 6; i++) {
      var o = i * 4;
      indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    var position = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    var texCoord = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoord);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);
    var index = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    return { position: position, texCoord: texCoord, index: index };
  }

  function drawScene(gl, info, buffers, texture, rotation, w, h) {
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.043, 0.055, 0.078, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    var projection = mat4Perspective((45 * Math.PI) / 180, w / h, 0.1, 100.0);
    // 원본 drawScene과 동일한 회전 조합: Z(r) → Y(0.7r) → X(0.3r)
    var modelView = mat4Multiply(
      mat4Translate(0, 0, -6),
      mat4Multiply(mat4RotZ(rotation), mat4Multiply(mat4RotY(rotation * 0.7), mat4RotX(rotation * 0.3)))
    );

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(info.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(info.attribLocations.vertexPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.texCoord);
    gl.vertexAttribPointer(info.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(info.attribLocations.textureCoord);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.index);

    gl.useProgram(info.program);
    gl.uniformMatrix4fv(info.uniformLocations.projectionMatrix, false, projection);
    gl.uniformMatrix4fv(info.uniformLocations.modelViewMatrix, false, modelView);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(info.uniformLocations.uSampler, 0);

    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
  }

  // ── 2D 캡처 폴백용: drawElementImage 호환 호출 (시그니처 3종 순차) ──
  function drawElementCompat(ctx2d, fnName, el, w, h, errsOut) {
    var attempts = [
      ['(el,x,y)', function () { ctx2d[fnName](el, 0, 0); }],
      ['(el,x,y,w,h)', function () { ctx2d[fnName](el, 0, 0, w, h); }],
      ['(el)', function () { ctx2d[fnName](el); }],
    ];
    for (var i = 0; i < attempts.length; i++) {
      try { attempts[i][1](); return true; }
      catch (e) { errsOut.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
    }
    return false;
  }

  function mount(el) {
    ensureStyle();

    var W = 480, H = 360;
    var wrap = document.createElement('div');
    wrap.className = 'owc-wrap';

    var canvas = document.createElement('canvas');
    canvas.className = 'owc-gl';
    canvas.width = W;
    canvas.height = H;

    var note = document.createElement('p');
    note.className = 'owc-note';
    var errBox = document.createElement('div');
    errBox.className = 'owc-error';

    var destroyed = false;
    var rafId = 0;
    var errShown = false;
    function showError(title, lines) {
      if (errShown) return;
      errShown = true;
      errBox.style.display = 'block';
      errBox.textContent = '⚠️ ' + title + '\n' + lines.join('\n');
    }

    // ── 감지 ──
    var probe2d = document.createElement('canvas').getContext('2d');
    var draw2dFn = ['drawElementImage', 'drawElement'].filter(function (n) {
      return typeof probe2d[n] === 'function';
    })[0] || null;

    var gl = canvas.getContext('webgl2');
    var isGL2 = Boolean(gl);
    if (!gl) gl = canvas.getContext('webgl');

    var texFnOk = Boolean(gl) && typeof gl.texElementImage2D === 'function';
    var mode = null; // 'native' | 'fallback2d' | 'dom'
    if (gl && texFnOk) mode = 'native';
    else if (gl && draw2dFn) mode = 'fallback2d';
    else mode = 'dom';

    // ── DOM 조립 (모드별) ──
    var tpl = document.createElement('div');
    tpl.innerHTML = CONTENT_HTML;
    var contentEl = tpl.firstElementChild;

    var srcCanvas = null, srcCtx = null, srcWrap = null;

    if (mode === 'native') {
      // 원본 그대로: WebGL canvas가 layoutsubtree로 HTML을 소유
      canvas.setAttribute('layoutsubtree', 'true');
      canvas.appendChild(contentEl);
      wrap.appendChild(canvas);
      note.textContent = '원본(WICG webGL.html)과 동일하게 gl.texElementImage2D로 살아있는 HTML을 큐브 텍스처에 업로드합니다.';
    } else if (mode === 'fallback2d') {
      // 폴백: 2D 소스 canvas가 HTML을 소유 → drawElementImage 캡처 → texImage2D 업로드
      srcWrap = document.createElement('div');
      srcWrap.className = 'owc-src-wrap';
      srcCanvas = document.createElement('canvas');
      srcCanvas.setAttribute('layoutsubtree', '');
      srcCanvas.width = 10;
      srcCanvas.height = 10;
      srcCtx = srcCanvas.getContext('2d');
      srcCanvas.appendChild(contentEl);
      srcWrap.appendChild(srcCanvas);
      wrap.appendChild(canvas);
      wrap.appendChild(srcWrap); // z-index:-1 겹침만으로 숨김 (display:none 금지)
      note.textContent = 'texElementImage2D 미지원 → 2D drawElementImage 캡처 후 texImage2D로 업로드하는 폴백 경로입니다.';
    } else {
      // 미지원: DOM 직접 표시
      // 미지원: 요구 사항 안내만 표시 (DOM 폴백 없음)
      note.textContent = gl ? 'Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.' : 'WebGL을 초기화할 수 없습니다. ' + 'Chromium 146 이상에서 chrome://flags/#canvas-draw-element 를 Enabled로 켜야 볼 수 있습니다.';
    }

    wrap.appendChild(note);
    wrap.appendChild(errBox);
    el.appendChild(wrap);

    // ── WebGL 준비 (native / fallback2d 공통) ──
    var renderCtx = null;
    if (mode !== 'dom') {
      try {
        var program = initShaderProgram(gl, VS, FS);
        var programInfo = {
          program: program,
          attribLocations: {
            vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
            textureCoord: gl.getAttribLocation(program, 'aTextureCoord'),
          },
          uniformLocations: {
            projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
            modelViewMatrix: gl.getUniformLocation(program, 'uModelViewMatrix'),
            uSampler: gl.getUniformLocation(program, 'uSampler'),
          },
        };
        var buffers = initBuffers(gl);
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // 첫 업로드 전 1픽셀 플레이스홀더 (검은 큐브 방지)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
          new Uint8Array([217, 180, 91, 255]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // 원본과 동일
        renderCtx = { gl: gl, program: programInfo, buffers: buffers, texture: texture };
      } catch (e) {
        showError('WebGL 초기화 실패', [e.name + ': ' + e.message]);
        mode = 'dom';
      }
    }

    // ── 텍스처 업로드 — paint 이벤트 안에서만 (함정 규칙) ──
    var captureOk = false, paintSeen = false, failStreak = 0;
    var IFMT = isGL2 ? gl.RGBA8 : (gl ? gl.RGBA : 0);

    /** native: 원본의 texElementImage2D 신형→구형 폴백 + 시그니처 순차 시도. */
    function uploadNative() {
      var errs = [];
      var attempts = [
        // 신형 (원본 1차): (target, internalFormat, el)
        ['(target, internalFormat, el)', function () {
          gl.texElementImage2D(gl.TEXTURE_2D, IFMT, contentEl);
        }],
        // 구형 (원본 catch 폴백): (target, level, internalFormat, srcFormat, destType, el)
        ['(target, 0, internalFormat, RGBA, UNSIGNED_BYTE, el)', function () {
          gl.texElementImage2D(gl.TEXTURE_2D, 0, IFMT, gl.RGBA, gl.UNSIGNED_BYTE, contentEl);
        }],
        // 예비: internalFormat을 RGBA로
        ['(target, 0, RGBA, RGBA, UNSIGNED_BYTE, el)', function () {
          gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, contentEl);
        }],
      ];
      gl.bindTexture(gl.TEXTURE_2D, renderCtx.texture);
      for (var i = 0; i < attempts.length; i++) {
        try { attempts[i][1](); return true; }
        catch (e) { errs.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
      }
      failStreak++;
      if (!captureOk && failStreak === 90) showError('texElementImage2D 계속 실패', errs);
      return false;
    }

    /** fallback2d: 소스 canvas에 drawElementImage 캡처 → texImage2D 업로드. */
    function uploadFallback2d() {
      var w = contentEl.offsetWidth || 300;
      var h = contentEl.offsetHeight || 200;
      if (srcCanvas.width !== w) srcCanvas.width = w;
      if (srcCanvas.height !== h) srcCanvas.height = h;
      if (srcCtx.reset) srcCtx.reset(); else srcCtx.clearRect(0, 0, w, h);
      var errs = [];
      if (!drawElementCompat(srcCtx, draw2dFn, contentEl, w, h, errs)) {
        failStreak++;
        if (!captureOk && failStreak === 90) showError('drawElementImage 계속 실패', errs);
        return false;
      }
      gl.bindTexture(gl.TEXTURE_2D, renderCtx.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      return true;
    }

    function upload() {
      var ok = mode === 'native' ? uploadNative() : uploadFallback2d();
      if (ok) { captureOk = true; failStreak = 0; }
      return ok;
    }

    var paintTarget = mode === 'native' ? canvas : srcCanvas;
    function onPaint() {
      if (destroyed) return;
      paintSeen = true;
      try { upload(); } catch (e) { showError('paint 업로드 예외', [e.name + ': ' + e.message]); }
    }
    if (mode !== 'dom' && paintTarget) {
      paintTarget.addEventListener('paint', onPaint);
      if (typeof paintTarget.requestPaint === 'function') paintTarget.requestPaint(); // 원본과 동일한 시동
    }

    // ── rAF 루프: 촬영 '요청'만 + 큐브 렌더 ──
    var cubeRotation = 0;
    var lastTime = 0;
    function tick(now) {
      if (destroyed) return;
      try {
        if (mode !== 'dom' && renderCtx) {
          var t = now * 0.001;
          var dt = lastTime ? t - lastTime : 0;
          lastTime = t;
          if (paintTarget && typeof paintTarget.requestPaint === 'function') {
            paintTarget.requestPaint(); // 실제 업로드는 paint 핸들러에서
          }
          if (!paintSeen) upload(); // paint 이벤트 미지원 빌드 폴백
          drawScene(gl, renderCtx.program, renderCtx.buffers, renderCtx.texture,
            cubeRotation, canvas.width, canvas.height);
          cubeRotation += dt; // 원본과 동일: 초당 1라디안
        }
      } catch (e) {
        showError('렌더 루프 예외', [e.name + ': ' + e.message]);
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);

    return {
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        cancelAnimationFrame(rafId);
        if (paintTarget) paintTarget.removeEventListener('paint', onPaint);
        if (gl) {
          var lose = gl.getExtension('WEBGL_lose_context');
          if (lose) lose.loseContext();
        }
        wrap.remove();
      },
    };
  }

  var CODE =
    '<!-- 원본: WICG/html-in-canvas Examples/webGL.html -->\n' +
    '<canvas id="gl-canvas" layoutsubtree="true">\n' +
    '  <div id="draw_element" inert>서식 있는 HTML, RTL, 세로쓰기, SVG…</div>\n' +
    '</canvas>\n' +
    '<script>\n' +
    'const gl = canvas.getContext(\'webgl2\');\n' +
    '\n' +
    '// HTML 요소 → WebGL 텍스처 (신형 → 구형 시그니처 폴백, 원본 그대로)\n' +
    'function loadTexture(gl) {\n' +
    '  const texture = gl.createTexture();\n' +
    '  gl.bindTexture(gl.TEXTURE_2D, texture);\n' +
    '  try {\n' +
    '    gl.texElementImage2D(gl.TEXTURE_2D, gl.RGBA8, draw_element);\n' +
    '  } catch (e) {\n' +
    '    gl.texElementImage2D(gl.TEXTURE_2D, 0, gl.RGBA8,\n' +
    '                         gl.RGBA, gl.UNSIGNED_BYTE, draw_element);\n' +
    '  }\n' +
    '  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);\n' +
    '  return texture;\n' +
    '}\n' +
    'gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);\n' +
    '\n' +
    '// 업로드는 paint 이벤트 안에서만 안정 — rAF에서는 requestPaint 요청만\n' +
    'canvas.onpaint = () => { /* loadTexture + drawScene 시작 */ };\n' +
    'canvas.requestPaint();\n' +
    '</script>';

  window.CUIDocs.register({
    id: 'official-webgl-cube',
    name: 'WebGL 큐브',
    emoji: '🧊',
    section: 'official',
    oneLiner: 'HTML을 WebGL 큐브 텍스처로 (공식 데모 이식)',
    code: CODE,
    mount: mount,
  });
})();
