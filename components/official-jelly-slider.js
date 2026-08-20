/**
 * official-jelly-slider — WICG html-in-canvas 공식 WebGPU 젤리 슬라이더 데모 이식
 * 원본: https://github.com/WICG/html-in-canvas/tree/main/Examples/webgpu-jelly-slider
 *   (MIT License, Copyright (c) 2025 Software Mansion — TypeGPU 예제 기반,
 *    Voicu Apostol의 작업에서 영감. 원본은 TypeGPU DSL이므로 WGSL로 재작성 이식)
 *
 * 원본 메커니즘 재현:
 *  1. <input type="range"> DOM이 진짜 컨트롤 — 값·포커스·접근성 모두 네이티브.
 *  2. 값 표시 DOM(div)을 queue.copyElementImageToTexture 로 WebGPU 텍스처에 캡처,
 *     레이마치 셰이더가 바닥면에 그 텍스처를 입힌다.
 *  3. 슬라이더 트랙은 CPU 버렛(Verlet) 로프 물리(17점, 거리·굽힘 제약 + 아치 바이어스)
 *     → 점 배열을 스토리지 버퍼로 올려 SDF 캡슐 체인 + z 압출로 젤리 형상.
 *  4. 젤리 재질: 프레넬(슐릭, IOR 1.42) + 굴절 + Beer-Lambert 흡수 + 전방 산란.
 *  5. 색은 CSS(getComputedStyle)에서 읽음 — :focus 파랑, 다크/강제색 대응(원본 동일).
 *  6. prefers-reduced-motion/transparency → 물리 감쇠 1.0, 아치·산란 0 (원본 동일).
 *
 * 함정 규칙 적용:
 *  - 촬영(copyElementImageToTexture)은 canvas 'paint' 이벤트 핸들러 안에서만.
 *    rAF에서는 canvas.requestPaint?.() 로 요청만.
 *  - 시그니처 3종 순차 try + 전부 실패 시 에러 전체 나열.
 *  - 캡처 소스(값 div)는 layoutsubtree canvas의 자식(화면에 안 그려짐).
 *    display:none 금지, getImageData/toDataURL 미사용.
 *  - 실험 API 전부 감지 가드. WebGPU 미지원/실패 시 2D 버퍼 유사 변형 폴백.
 *  - 현재 렌더 경로를 배지로 표시.
 */
(function () {
  'use strict';

  var ID = 'official-jelly-slider';
  var STYLE_ID = 'cui-style-' + ID;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.ojelly-wrap { position: relative; width: 100%; max-width: 720px;',
      '  overflow: hidden; border-radius: 12px; }',
      /* 캔버스는 불투명 배경 — 첫 프레임 전에도 z-index:-1 캡처 소스가 비치지 않게 */
      '.ojelly-canvas { display: block; width: 100%; aspect-ratio: 16 / 9;',
      '  border-radius: 12px; background: rgb(233,233,233); }',
      '@media (prefers-color-scheme: dark) { .ojelly-canvas { background: rgb(22,22,22); } }',
      '[data-theme="dark"] .ojelly-canvas { background: rgb(22,22,22); }',
      /* 진짜 컨트롤: 투명하지만 네이티브 포커스·드래그·키보드 그대로 (원본 opacity:0 동일) */
      '.ojelly-range { position: absolute; left: 10%; right: 10%; top: 38%; height: 26%;',
      '  width: 80%; margin: 0; opacity: 0; cursor: grab; }',
      '.ojelly-range:active { cursor: grabbing; }',
      /* 원본 CSS 변수 구성 그대로: color=젤리, background-color=바닥, caret-color=글자 */
      '.ojelly-range { --jel: rgb(255,115,19); --gnd: rgb(245,245,245); --txt: rgb(40,40,40);',
      '  color: var(--jel); background-color: var(--gnd); caret-color: var(--txt); }',
      '.ojelly-range:focus { --jel: rgb(51,153,255); }',
      '@media (prefers-color-scheme: dark) {',
      '  .ojelly-range { --gnd: rgb(26,26,26); --txt: rgb(204,204,204); } }',
      '[data-theme="dark"] .ojelly-range { --gnd: rgb(26,26,26); --txt: rgb(204,204,204); }',
      '@media (prefers-contrast: more) {',
      '  .ojelly-range { --jel: rgb(255,51,0); }',
      '  .ojelly-range:focus { --jel: rgb(0,0,255); } }',
      '@media (forced-colors: active) {',
      '  .ojelly-range { --jel: transparent; --gnd: Canvas; --txt: CanvasText; }',
      '  .ojelly-range:focus { --jel: Highlight; } }',
      /* 캡처 소스(값 div): layoutsubtree canvas의 자식이라 화면에 안 그려짐.
         display:none 금지 — 레이아웃·페인트 기록이 있어야 캡처된다.
         z-index:-1은 자식 렌더링하는 구빌드 대비 보험. */
      '.ojelly-value { position: absolute; left: 0; top: 0; z-index: -1;',
      '  width: 368px; height: 64px; line-height: 64px; text-align: right;',
      '  color: white; font: 700 44px sans-serif; pointer-events: none; }',
      '.ojelly-badge { position: absolute; top: 8px; right: 8px; z-index: 2;',
      '  font-size: 11px; padding: 3px 8px; border-radius: 999px;',
      '  background: rgba(0,0,0,0.55); color: #fff; pointer-events: none; }',
      '.ojelly-err { display: none; white-space: pre-wrap; font-size: 12px; color: #c0392b;',
      '  border: 1px solid #c0392b; border-radius: 6px; padding: 8px; margin-top: 8px; }',
      '.ojelly-knobs { display: flex; flex-wrap: wrap; gap: 20px; align-items: end; }',
      '.ojelly-knobs label { display: block; font-size: 12px; margin-bottom: 4px; }',
      '.ojelly-knobs input[type="range"] { width: 160px; }',
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ───────── 버렛 로프 물리 (원본 Slider 클래스의 JS 이식) ───────── */

  var N = 17;               // 점 개수 (원본 NUM_POINTS)
  var TOTAL_LEN = 1.9;      // 앵커(-1,0) → 최대(0.9,0)
  var Y_OFF = -0.03;

  function Rope() {
    this.px = new Float64Array(N);
    this.py = new Float64Array(N);
    this.ppx = new Float64Array(N);
    this.ppy = new Float64Array(N);
    this.anchorX = -1; this.baseY = 0;
    this.targetX = 0.9;
    this.restLen = TOTAL_LEN / (N - 1);
    this.iterations = 16; this.substeps = 6;
    this.damping = 0.01; this.bendingStrength = 0.1; this.bendingExponent = 1.2;
    this.archStrength = 2; this.archEdgeDeadzone = 0.01;
    this.endFlatStiffness = 0.05;
    for (var i = 0; i < N; i++) {
      var t = i / (N - 1);
      this.px[i] = -1 + t * TOTAL_LEN;
      this.py[i] = Y_OFF;
      this.ppx[i] = this.px[i]; this.ppy[i] = this.py[i];
    }
  }
  Rope.prototype.setDragX = function (x) {
    var minX = this.anchorX - TOTAL_LEN + 2.6;
    var maxX = this.anchorX + TOTAL_LEN;
    this.targetX = Math.min(maxX, Math.max(minX, x));
  };
  Rope.prototype.projectDist = function (i, j, rest, k) {
    var dx = this.px[j] - this.px[i], dy = this.py[j] - this.py[i];
    var len = Math.hypot(dx, dy);
    if (len < 1e-8) return;
    var wi = (i === 0 || i === N - 1) ? 0 : 1;
    var wj = (j === 0 || j === N - 1) ? 0 : 1;
    var ws = wi + wj;
    if (ws <= 0) return;
    var diff = (len - rest) / len;
    var c1 = (wi / ws) * k, c2 = (wj / ws) * k;
    this.px[i] += dx * diff * c1; this.py[i] += dy * diff * c1;
    this.px[j] -= dx * diff * c2; this.py[j] -= dy * diff * c2;
  };
  Rope.prototype.update = function (dt) {
    if (dt <= 0) return;
    var h = dt / this.substeps;
    var damp = Math.min(0.999, Math.max(0, this.damping));
    var compression = Math.max(0, 1 - Math.abs(this.targetX - this.anchorX) / TOTAL_LEN);
    for (var s = 0; s < this.substeps; s++) {
      // 적분 + 아치 바이어스
      for (var i = 0; i < N; i++) {
        if (i === 0) { this.px[i] = this.ppx[i] = this.anchorX; this.py[i] = this.ppy[i] = this.baseY + Y_OFF; continue; }
        if (i === N - 1) { this.px[i] = this.ppx[i] = this.targetX; this.py[i] = this.ppy[i] = 0.08 + Y_OFF; continue; }
        var x0 = this.px[i], y0 = this.py[i];
        var vx = (x0 - this.ppx[i]) * (1 - damp);
        var vy = (y0 - this.ppy[i]) * (1 - damp);
        var ay = 0;
        if (compression > 0) {
          var t = i / (N - 1), e = this.archEdgeDeadzone;
          var sm = function (a, b, v) { v = Math.min(1, Math.max(0, (v - a) / (b - a))); return v * v * (3 - 2 * v); };
          var win = sm(e, 1 - e, t) * sm(e, 1 - e, 1 - t);
          ay = this.archStrength * Math.sin(Math.PI * t) * win * compression;
        }
        this.ppx[i] = x0; this.ppy[i] = y0;
        this.px[i] = x0 + vx; this.py[i] = y0 + vy + ay * h * h;
        if (this.py[i] < this.baseY + Y_OFF) this.py[i] = this.baseY + Y_OFF;
      }
      // 제약 투영
      for (var it = 0; it < this.iterations; it++) {
        for (var a = 0; a < N - 1; a++) this.projectDist(a, a + 1, this.restLen, 0.1);
        for (var b = 1; b < N - 1; b++) {
          var tb = b / (N - 1);
          var dc = Math.abs(tb - 0.5) * 2;
          var k = this.bendingStrength * (0.05 + 0.95 * Math.pow(dc, this.bendingExponent));
          this.projectDist(b - 1, b + 1, 2 * this.restLen, k);
        }
        // 끝단 평탄화
        var yT = this.baseY + Y_OFF, kf = this.endFlatStiffness;
        this.py[1] += (yT - this.py[1]) * kf;
        this.py[N - 2] += (yT - this.py[N - 2]) * kf;
        // 끝점 재고정
        this.px[0] = this.anchorX; this.py[0] = this.baseY + Y_OFF;
        this.px[N - 1] = this.targetX; this.py[N - 1] = 0.08 + Y_OFF;
      }
    }
  };

  /* ───────── WGSL (원본 TypeGPU 레이마처의 WGSL 재작성) ───────── */

  var WGSL = [
    'struct U {',
    '  res      : vec4f, // x,y=해상도 z=aspect w=tan(fov/2)',
    '  camPos   : vec4f,',
    '  camRight : vec4f,',
    '  camUp    : vec4f,',
    '  camFwd   : vec4f,',
    '  jelly    : vec4f, // rgb + alpha',
    '  ground   : vec4f, // rgb + endX',
    '  textCol  : vec4f, // rgb + scatter',
    '  lightDir : vec4f, // xyz + time',
    '};',
    '@group(0) @binding(0) var<uniform> u : U;',
    '@group(0) @binding(1) var<storage, read> pts : array<vec2f, 17>;',
    '@group(0) @binding(2) var valueTex : texture_2d<f32>;',
    '@group(0) @binding(3) var samp : sampler;',
    '',
    'struct VOut { @builtin(position) pos : vec4f, @location(0) uv : vec2f };',
    '',
    '@vertex fn vs(@builtin(vertex_index) vi : u32) -> VOut {',
    '  var p = array<vec2f, 3>(vec2f(-1.0,-1.0), vec2f(3.0,-1.0), vec2f(-1.0,3.0));',
    '  var o : VOut;',
    '  o.pos = vec4f(p[vi], 0.0, 1.0);',
    '  o.uv = p[vi];',
    '  return o;',
    '}',
    '',
    '// 로프까지의 2D 거리 + 진행도 t (원본 sdInflatedPolyline2D 역할)',
    'fn ropeDist(p : vec2f) -> vec2f {',
    '  var best = 1e9; var bt = 0.0;',
    '  for (var i = 0; i < 16; i++) {',
    '    let a = pts[i]; let b = pts[i + 1];',
    '    let ba = b - a; let pa = p - a;',
    '    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);',
    '    let d = length(pa - ba * h);',
    '    if (d < best) { best = d; bt = (f32(i) + h) / 16.0; }',
    '  }',
    '  return vec2f(best, bt);',
    '}',
    '',
    '// 젤리 SDF: 2D 로프 거리 → z 압출(반두께 0.17) → 라운딩 0.024 (원본 상수)',
    'fn jellyDist(p : vec3f) -> f32 {',
    '  let r = ropeDist(p.xy);',
    '  let w = vec2f(r.x, abs(p.z) - 0.17);',
    '  return min(max(w.x, w.y), 0.0) + length(max(w, vec2f(0.0))) - 0.024;',
    '}',
    '',
    'fn sdRBox(p : vec2f, b : vec2f, r : f32) -> f32 {',
    '  let q = abs(p) - b + vec2f(r);',
    '  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;',
    '}',
    'fn cutout(p : vec2f) -> f32 { return sdRBox(p, vec2f(1.02, 0.22), 0.22); }',
    '',
    '// 바닥: 평면(y=-0.06) ∪ 라운드 사각 홈 슬래브 (원본 getMainSceneDist)',
    'fn mainDist(p : vec3f) -> f32 {',
    '  let plane = p.y + 0.06;',
    '  let w = vec2f(-cutout(p.xz), abs(p.y) - 0.01);',
    '  let slab = min(max(w.x, w.y), 0.0) + length(max(w, vec2f(0.0))) - 0.02;',
    '  return min(plane, slab);',
    '}',
    '',
    'fn mainNormal(p : vec3f) -> vec3f {',
    '  if (abs(p.z) > 0.26 || abs(p.x) > 1.06) { return vec3f(0.0, 1.0, 0.0); }',
    '  let e = 0.001;',
    '  let n = vec3f(',
    '    mainDist(p + vec3f(e,0.0,0.0)) - mainDist(p - vec3f(e,0.0,0.0)),',
    '    mainDist(p + vec3f(0.0,e,0.0)) - mainDist(p - vec3f(0.0,e,0.0)),',
    '    mainDist(p + vec3f(0.0,0.0,e)) - mainDist(p - vec3f(0.0,0.0,e)));',
    '  return normalize(n);',
    '}',
    '',
    'fn jellyNormal(p : vec3f) -> vec3f {',
    '  let e = 0.005;',
    '  let k = vec2f(1.0, -1.0);',
    '  return normalize(',
    '    k.xyy * jellyDist(p + k.xyy * e) + k.yyx * jellyDist(p + k.yyx * e) +',
    '    k.yxy * jellyDist(p + k.yxy * e) + k.xxx * jellyDist(p + k.xxx * e));',
    '}',
    '',
    '// 젤리가 바닥에 드리우는 가짜 그림자 (원본 getFakeShadow의 근사)',
    'fn fakeShadow(pos : vec3f) -> vec3f {',
    '  let l = -u.lightDir.xyz;',
    '  if (pos.y < -0.03) {',
    '    // 홈 내부: 벽 가장자리 어두움 + 빛 방향 그라데이션 (원본 동일 구성)',
    '    let edge = clamp(1.0 - (cutout(pos.xz) + 0.02) * 30.0, 0.0, 1.0);',
    '    let grad = clamp(-pos.z * 4.0 * l.z + 1.0, 0.0, 1.0);',
    '    return vec3f(edge * grad * 0.5);',
    '  }',
    '  var best = 1e9; var hgt = 0.0;',
    '  for (var i = 0; i < 16; i++) {',
    '    let A = pts[i]; let B = pts[i + 1];',
    '    let a2 = vec2f(A.x + 0.25 * A.y, 0.45 * A.y + 0.05);',
    '    let b2 = vec2f(B.x + 0.25 * B.y, 0.45 * B.y + 0.05);',
    '    let ba = b2 - a2; let pa = pos.xz - a2;',
    '    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);',
    '    let d = length(pa - ba * h);',
    '    if (d < best) { best = d; hgt = mix(A.y, B.y, h); }',
    '  }',
    '  let soft = 0.10 + hgt * 0.35; // 높이 올라갈수록 부드러운 그림자',
    '  let sh = smoothstep(0.02, 0.02 + soft, best);',
    '  let shadowCol = mix(u.jelly.rgb * 0.55 + vec3f(0.15), vec3f(1.0), sh);',
    '  return shadowCol;',
    '}',
    '',
    '// 바닥 셰이딩: 조명 + 그림자 + 값 텍스처(DOM 캡처)를 바닥에 투영',
    'fn groundShade(pos : vec3f, ro : vec3f) -> vec3f {',
    '  let n = mainNormal(pos);',
    '  let l = -u.lightDir.xyz;',
    '  let sh = fakeShadow(pos);',
    '  let diffuse = max(dot(n, l), 0.0);',
    '  let viewDir = normalize(ro - pos);',
    '  let reflDir = reflect(-l, n);',
    '  let spec = pow(max(dot(viewDir, reflDir), 0.0), 10.0) * 0.6;',
    '  let base = vec3f(0.9);',
    '  var lit = clamp(base * diffuse * sh + base * 0.36 + vec3f(spec) * sh, vec3f(0.0), vec3f(1.0));',
    '  // 젤리 끝단 근처의 색 반사광 (원본 bounce light)',
    '  let endX = u.ground.w;',
    '  let sq = dot(pos - vec3f(endX, 0.0, 0.0), pos - vec3f(endX, 0.0, 0.0));',
    '  var col = u.ground.rgb * lit + u.jelly.rgb * (0.4 / (sq * 15.0 + 1.0));',
    '  // 값 텍스처: 중심 (0,0), 폭 1.9 × 높이 0.33 영역 (원본 renderPercentageOnGround)',
    '  let uvX = (pos.x + 0.95) / 1.9;',
    '  let uvZ = (pos.z + 0.165) / 0.33;',
    '  if (uvX >= 0.0 && uvX <= 1.0 && uvZ >= 0.0 && uvZ <= 1.0 && pos.y < 0.0) {',
    '    let tx = textureSampleLevel(valueTex, samp, vec2f(uvX, uvZ), 0.0);',
    '    col = mix(col, u.textCol.rgb, clamp(tx.x * tx.a + tx.x, 0.0, 1.0) * step(0.02, tx.x));',
    '  }',
    '  return col;',
    '}',
    '',
    '// 젤리 제외 배경 마치 (원본 rayMarchNoJelly — 굴절광이 도달하는 환경)',
    'fn marchGround(ro : vec3f, rd : vec3f) -> vec3f {',
    '  var t = 0.02;',
    '  for (var i = 0; i < 8; i++) {',
    '    let p = ro + rd * t;',
    '    let h = mainDist(p);',
    '    t += h;',
    '    if (t > 8.0 || h < 0.01) { break; }',
    '  }',
    '  if (t < 8.0) { return groundShade(ro + rd * t, ro); }',
    '  return vec3f(0.0);',
    '}',
    '',
    '@fragment fn fs(inp : VOut) -> @location(0) vec4f {',
    '  let ndc = inp.uv;',
    '  let rd = normalize(u.camFwd.xyz',
    '    + u.camRight.xyz * ndc.x * u.res.z * u.res.w',
    '    + u.camUp.xyz * ndc.y * u.res.w);',
    '  let ro = u.camPos.xyz;',
    '',
    '  var t = 0.0; var kind = 0; // 0=없음 1=바닥 2=젤리',
    '  for (var i = 0; i < 64; i++) {',
    '    let p = ro + rd * t;',
    '    let dm = mainDist(p);',
    '    let dj = jellyDist(p);',
    '    let d = min(dm, dj);',
    '    if (d < 0.001) {',
    '      if (dj < dm) { kind = 2; } else { kind = 1; }',
    '      break;',
    '    }',
    '    t += d;',
    '    if (t > 8.0) { break; }',
    '  }',
    '  if (kind == 0) {',
    '    // 미스: 원본처럼 배경을 항상 칠함 (불투명 — 뒤의 캡처 소스 div 가림)',
    '    return vec4f(tanh(u.ground.rgb * 0.92 * 1.3), 1.0);',
    '  }',
    '',
    '  let pos = ro + rd * t;',
    '  var col = vec3f(0.0);',
    '  if (kind == 1) {',
    '    col = groundShade(pos, ro);',
    '  } else {',
    '    // 젤리: 프레넬 + 굴절 + Beer-Lambert + 산란 (원본 rayMarch의 젤리 분기)',
    '    let info = ropeDist(pos.xy);',
    '    let progress = info.y;',
    '    let n = jellyNormal(pos);',
    '    let cosi = clamp(dot(-rd, n), 0.0, 1.0);',
    '    let rr = (1.0 - 1.42) / (1.0 + 1.42);',
    '    let r0 = rr * rr; // pow(음수, f32)는 WGSL에서 미정의 — 곱으로 계산',
    '    let F = r0 + (1.0 - r0) * pow(1.0 - cosi, 5.0);',
    '    let reflection = clamp(vec3f(pos.y + 0.2), vec3f(0.0), vec3f(1.0));',
    '    var refracted = vec3f(0.0);',
    '    let eta = 1.0 / 1.42;',
    '    let kk = 1.0 - eta * eta * (1.0 - cosi * cosi);',
    '    if (kk > 0.0) {',
    '      let refr = normalize(rd * eta + n * (eta * cosi - sqrt(kk)));',
    '      let env = marchGround(pos + refr * 0.004, refr);',
    '      let absorb = (vec3f(1.0) - u.jelly.rgb) * 20.0 * progress * progress;',
    '      let T = exp(-absorb * 0.08);',
    '      let l = -u.lightDir.xyz;',
    '      let forward = max(dot(l, refr), 0.0);',
    '      let scatter = u.jelly.rgb * 1.5 * (u.textCol.w * forward * pow(progress, 3.0));',
    '      refracted = env * T + scatter;',
    '    }',
    '    let jellyCol = reflection * F + refracted * (1.0 - F);',
    '    if (u.jelly.a < 0.999) {',
    '      // forced-colors 등 투명 젤리: 뒤 배경과 혼합 (원본 finalJelly mix)',
    '      let bg = marchGround(pos + rd * 0.05, rd);',
    '      col = mix(bg, jellyCol, u.jelly.a);',
    '    } else {',
    '      col = jellyCol;',
    '    }',
    '  }',
    '  let mapped = tanh(col * 1.3); // 원본 톤매핑',
    '  return vec4f(mapped, 1.0);',
    '}',
  ].join('\n');

  /* ───────── 공통 유틸 ───────── */

  function parseColor(str, out4) {
    var m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([0-9.]+))?\)/.exec(str || '');
    if (m) {
      return {
        r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255,
        a: m[4] !== undefined ? parseFloat(m[4]) : 1,
      };
    }
    return out4 || { r: 1, g: 1, b: 1, a: 1 };
  }

  var TEX_W = 736, TEX_H = 128;

  /* ───────── mount ───────── */

  function mount(el) {
    ensureStyle();

    var wrap = document.createElement('div');
    wrap.className = 'ojelly-wrap';
    wrap.innerHTML =
      // 캡처 소스(값 div)는 layoutsubtree canvas의 자식 — canvas의 paint 이벤트가
      // 이 요소의 페인트 기록을 보장한다 (다른 공식 이식 4종과 동일 구조)
      '<canvas class="ojelly-canvas" layoutsubtree>' +
      '<div class="ojelly-value" aria-hidden="true"></div>' +
      '</canvas>' +
      '<input class="ojelly-range" type="range" min="0" max="100" step="1" value="100"' +
      ' aria-label="젤리 슬라이더">' +
      '<div class="ojelly-badge">경로: 확인 중…</div>' +
      '<div class="ojelly-err"></div>';
    el.appendChild(wrap);

    var canvas = wrap.querySelector('canvas');
    var range = wrap.querySelector('.ojelly-range');
    var valueEl = wrap.querySelector('.ojelly-value');
    var badge = wrap.querySelector('.ojelly-badge');
    var errBox = wrap.querySelector('.ojelly-err');

    var destroyed = false;
    var raf = 0;
    var ro = null;
    var rope = new Rope();
    var targetX = 0.9, currentX = 0.9;
    var needCapture = true;
    var errShown = false;
    var mediaListeners = [];
    var colorOverride = null; // knobs 색 오버라이드

    var motionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    var darkMedia = window.matchMedia('(prefers-color-scheme: dark)');
    var contrastMedia = window.matchMedia('(prefers-contrast: more)');
    var forcedMedia = window.matchMedia('(forced-colors: active)');

    function onMedia(mq, fn) {
      if (mq && typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', fn);
        mediaListeners.push([mq, fn]);
      }
    }

    function showError(title, msg) {
      errBox.style.display = 'block';
      errBox.textContent = '⚠️ ' + title + '\n' + msg;
    }

    function valueText() { return range.value + ' %'; }
    valueEl.textContent = valueText();

    range.addEventListener('input', onInput);
    function onInput() {
      targetX = (Number(range.value) / 100) * 1.9 - 1.0;
      valueEl.textContent = valueText();
      needCapture = true;
    }

    // 감속 모드 (원본 updateReducedFeatures)
    var scatter = 3.0;
    function applyReduced() {
      if (motionMedia.matches) {
        rope.damping = 1.0; rope.archStrength = 0.0; scatter = 0.0;
      } else {
        rope.damping = 0.01; rope.archStrength = 2.0; scatter = 3.0;
      }
    }
    onMedia(motionMedia, applyReduced);
    applyReduced();

    /* ── 색: CSS에서 읽기 (원본 updateColors) ── */
    var jellyC = { r: 1, g: 0.45, b: 0.075, a: 1 };
    var groundC = { r: 0.96, g: 0.96, b: 0.96, a: 1 };
    var textC = { r: 0.16, g: 0.16, b: 0.16, a: 1 };
    function updateColors() {
      var cs = getComputedStyle(range);
      jellyC = colorOverride || parseColor(cs.color, jellyC);
      groundC = parseColor(cs.backgroundColor, groundC);
      textC = parseColor(cs.caretColor, textC);
    }
    range.addEventListener('focus', updateColors);
    range.addEventListener('blur', updateColors);
    onMedia(darkMedia, updateColors);
    onMedia(contrastMedia, updateColors);
    onMedia(forcedMedia, updateColors);
    updateColors();

    function resizeCanvas() {
      var w = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
      var h = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
    }
    try {
      ro = new ResizeObserver(function () { if (!destroyed) resizeCanvas(); });
      ro.observe(canvas);
    } catch (e) { /* 무시 */ }
    resizeCanvas();

    function stepPhysics(dt) {
      if (motionMedia.matches) {
        currentX = targetX;
        rope.restLen = Math.max(0.001, Math.abs(currentX - rope.anchorX)) / (N - 1);
      } else {
        currentX += (targetX - currentX) * 0.08;
        rope.restLen = TOTAL_LEN / (N - 1);
      }
      rope.setDragX(currentX);
      rope.update(dt);
    }

    /* ══════════ 경로 1: WebGPU ══════════ */

    function startWebGPU() {
      var device = null, ctx = null, pipeline = null, bindGroup = null;
      var uBuf = null, ptsBuf = null, valueTex = null, sampler = null;
      var format = navigator.gpu.getPreferredCanvasFormat();
      var uData = new Float32Array(36);
      var ptsData = new Float32Array(N * 2);
      var domCaptureOK = null; // null=미확정 true/false
      var textCanvas = null;

      function setBadge() {
        if (domCaptureOK === true) badge.textContent = '경로: WebGPU + copyElementImageToTexture';
        else if (domCaptureOK === false) badge.textContent = '경로: WebGPU (텍스트 캔버스 폴백 업로드)';
        else badge.textContent = '경로: WebGPU';
      }

      /* DOM 캡처 실패 시: 값 텍스트를 2D 캔버스로 그려 copyExternalImageToTexture */
      function uploadTextFallback() {
        try {
          if (!textCanvas) {
            textCanvas = document.createElement('canvas');
            textCanvas.width = TEX_W; textCanvas.height = TEX_H;
          }
          var c2 = textCanvas.getContext('2d');
          c2.clearRect(0, 0, TEX_W, TEX_H);
          c2.fillStyle = '#ffffff';
          c2.font = '700 88px sans-serif';
          c2.textAlign = 'right';
          c2.textBaseline = 'middle';
          c2.fillText(valueText(), TEX_W - 24, TEX_H / 2);
          device.queue.copyExternalImageToTexture(
            { source: textCanvas },
            { texture: valueTex },
            [TEX_W, TEX_H]
          );
        } catch (e) {
          if (!errShown) { errShown = true; showError('폴백 텍스트 업로드 실패', e.name + ': ' + e.message); }
        }
      }

      /* 시그니처 3종 순차 try (함정 규칙) — paint 핸들러 안에서만 호출 */
      function captureDom() {
        var q = device.queue;
        if (typeof q.copyElementImageToTexture !== 'function') {
          return { ok: false, errs: ['queue.copyElementImageToTexture 없음'] };
        }
        var attempts = [
          ['({source},{destination,width,height})', function () {
            q.copyElementImageToTexture(
              { source: valueEl },
              { destination: { texture: valueTex }, width: TEX_W, height: TEX_H });
          }],
          ['(el,width,height,{texture})', function () {
            q.copyElementImageToTexture(valueEl, TEX_W, TEX_H, { texture: valueTex });
          }],
          ['({source},{texture})', function () {
            q.copyElementImageToTexture({ source: valueEl }, { texture: valueTex });
          }],
        ];
        var errs = [];
        for (var i = 0; i < attempts.length; i++) {
          try { attempts[i][1](); return { ok: true }; }
          catch (e) { errs.push(attempts[i][0] + ' → ' + e.name + ': ' + e.message); }
        }
        return { ok: false, errs: errs };
      }

      /* 촬영은 'paint' 이벤트 핸들러 안에서만 (함정 규칙) */
      function onPaint() {
        if (destroyed || !device) return;
        var res = captureDom();
        if (res.ok) {
          domCaptureOK = true;
        } else {
          if (domCaptureOK !== false && !errShown) {
            errShown = true;
            showError('copyElementImageToTexture 모든 시그니처 실패', res.errs.join('\n'));
          }
          domCaptureOK = false;
          uploadTextFallback();
        }
        needCapture = false;
        setBadge();
      }
      canvas.addEventListener('paint', onPaint);

      function writeUniforms() {
        var w = canvas.width, h = canvas.height;
        var aspect = w / Math.max(1, h);
        var tanH = Math.tan(Math.PI / 8); // fov π/4
        // 카메라 (원본과 동일한 배치)
        var cp = [0, 2.7, 1.9];
        var fwd = norm3([-cp[0], -cp[1], -cp[2]]);
        var right = norm3(cross3(fwd, [0, 1, 0]));
        var up = cross3(right, fwd);
        uData.set([w, h, aspect, tanH], 0);
        uData.set([cp[0], cp[1], cp[2], 0], 4);
        uData.set([right[0], right[1], right[2], 0], 8);
        uData.set([up[0], up[1], up[2], 0], 12);
        uData.set([fwd[0], fwd[1], fwd[2], 0], 16);
        uData.set([jellyC.r, jellyC.g, jellyC.b, jellyC.a], 20);
        uData.set([groundC.r, groundC.g, groundC.b, rope.px[N - 1]], 24);
        uData.set([textC.r, textC.g, textC.b, scatter], 28);
        var l = norm3([0.19, -0.24, 0.75]);
        uData.set([l[0], l[1], l[2], performance.now() / 1000], 32);
        device.queue.writeBuffer(uBuf, 0, uData);
        for (var i = 0; i < N; i++) { ptsData[i * 2] = rope.px[i]; ptsData[i * 2 + 1] = rope.py[i]; }
        device.queue.writeBuffer(ptsBuf, 0, ptsData);
      }

      function norm3(v) { var L = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / L, v[1] / L, v[2] / L]; }
      function cross3(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      }

      var lastTs = performance.now();
      function frame(ts) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame);
        var dt = Math.min((ts - lastTs) * 0.001, 0.1);
        lastTs = ts;
        stepPhysics(dt);

        // rAF에서는 요청만 — 실제 촬영은 paint 핸들러에서 (함정 규칙)
        if (needCapture) {
          if (typeof canvas.requestPaint === 'function') canvas.requestPaint();
          else { uploadTextFallback(); needCapture = false; domCaptureOK = false; setBadge(); }
        }

        try {
          writeUniforms();
          var enc = device.createCommandEncoder();
          var pass = enc.beginRenderPass({
            colorAttachments: [{
              view: ctx.getCurrentTexture().createView(),
              loadOp: 'clear', storeOp: 'store',
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
            }],
          });
          pass.setPipeline(pipeline);
          pass.setBindGroup(0, bindGroup);
          pass.draw(3);
          pass.end();
          device.queue.submit([enc.finish()]);
        } catch (e) {
          cancelAnimationFrame(raf);
          if (!errShown) { errShown = true; showError('WebGPU 렌더 실패 → 2D 폴백 전환', e.name + ': ' + e.message); }
          start2DFallback('렌더 실패');
        }
      }

      navigator.gpu.requestAdapter().then(function (adapter) {
        if (destroyed) return null;
        if (!adapter) throw new Error('adapter 없음');
        return adapter.requestDevice();
      }).then(function (dev) {
        if (destroyed || !dev) { if (dev && dev.destroy) dev.destroy(); return; }
        device = dev;
        device.lost.then(function (info) {
          if (destroyed) return;
          device = null;
          start2DFallback('디바이스 손실: ' + (info && info.message || ''));
        });
        ctx = canvas.getContext('webgpu');
        if (!ctx) throw new Error('webgpu 컨텍스트 없음');
        ctx.configure({ device: device, format: format, alphaMode: 'premultiplied' });

        var mod = device.createShaderModule({ code: WGSL });
        pipeline = device.createRenderPipeline({
          layout: 'auto',
          vertex: { module: mod, entryPoint: 'vs' },
          fragment: { module: mod, entryPoint: 'fs', targets: [{ format: format }] },
          primitive: { topology: 'triangle-list' },
        });
        uBuf = device.createBuffer({ size: uData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        ptsBuf = device.createBuffer({ size: ptsData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        valueTex = device.createTexture({
          size: [TEX_W, TEX_H, 1], format: 'rgba8unorm',
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        bindGroup = device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uBuf } },
            { binding: 1, resource: { buffer: ptsBuf } },
            { binding: 2, resource: valueTex.createView() },
            { binding: 3, resource: sampler },
          ],
        });
        setBadge();
        needCapture = true;
        raf = requestAnimationFrame(frame);
      }).catch(function (e) {
        if (destroyed) return;
        showError('WebGPU 초기화 실패 → 2D 폴백 전환', (e && e.name || 'Error') + ': ' + (e && e.message || e));
        start2DFallback('초기화 실패');
      });

      cleanupFns.push(function () {
        canvas.removeEventListener('paint', onPaint);
        try { if (device) device.destroy(); } catch (e) { /* 무시 */ }
        device = null;
      });
    }

    /* ══════════ 경로 2: 2D 버퍼 유사 변형 폴백 ══════════ */

    var fallbackStarted = false;
    function start2DFallback(reason) {
      if (destroyed || fallbackStarted) return;
      fallbackStarted = true;
      badge.textContent = '경로: 2D 폴백' + (reason ? ' (' + reason + ')' : '');

      // webgpu 컨텍스트가 이미 잡힌 canvas는 2d를 못 얻으므로 새 canvas로 교체
      var c2d = document.createElement('canvas');
      c2d.className = 'ojelly-canvas';
      canvas.replaceWith(c2d);
      canvas = c2d;
      if (ro) { try { ro.observe(canvas); } catch (e) { /* 무시 */ } }
      resizeCanvas();
      var g = canvas.getContext('2d');

      var lastTs = performance.now();
      function frame2d(ts) {
        if (destroyed) return;
        raf = requestAnimationFrame(frame2d);
        var dt = Math.min((ts - lastTs) * 0.001, 0.1);
        lastTs = ts;
        stepPhysics(dt);
        needCapture = false;

        var W = canvas.width, H = canvas.height;
        g.clearRect(0, 0, W, H);
        // 배경을 항상 칠함 (불투명 — 캡처 소스 div 가림, WebGPU 경로와 동일 정책)
        g.fillStyle = 'rgba(' + Math.round(groundC.r * 235) + ',' + Math.round(groundC.g * 235) + ',' +
          Math.round(groundC.b * 235) + ',1)';
        g.fillRect(0, 0, W, H);
        // 월드 → 화면: x∈[-1.15,1.15], 바닥선은 62% 높이
        var s = W / 2.3, gy = H * 0.62;
        function sx(x) { return (x + 1.15) * s; }
        function sy(y) { return gy - y * s; }

        // 홈(트렌치) — 배경보다 살짝 어둡게
        g.fillStyle = 'rgba(' + Math.round(groundC.r * 205) + ',' + Math.round(groundC.g * 205) + ',' +
          Math.round(groundC.b * 205) + ',1)';
        var tw = 2.04 * s, th = 0.16 * s;
        roundRect(g, sx(-1.02), gy - th * 0.5, tw, th, th * 0.5);
        g.fill();

        // 그림자
        g.strokeStyle = 'rgba(0,0,0,0.14)';
        g.lineWidth = 0.06 * s;
        g.lineCap = 'round';
        ropePath(g, sx, function (y) { return gy + 0.02 * s; });
        g.stroke();

        // 젤리 본체: 로프를 따라 두꺼운 라운드 스트로크 + 세로 그라데이션
        var topY = sy(Math.max.apply(null, Array.prototype.slice.call(rope.py)) + 0.1);
        var grad = g.createLinearGradient(0, topY, 0, gy + 0.05 * s);
        grad.addColorStop(0, rgba(jellyC, 0.95, 1.25));
        grad.addColorStop(1, rgba(jellyC, jellyC.a, 0.85));
        g.strokeStyle = grad;
        g.lineWidth = 0.095 * s;
        ropePath(g, sx, function (y, i) { return sy(rope.py[i]); });
        g.stroke();
        // 하이라이트
        g.strokeStyle = 'rgba(255,255,255,0.45)';
        g.lineWidth = 0.022 * s;
        ropePath(g, sx, function (y, i) { return sy(rope.py[i] + 0.028); });
        g.stroke();

        // 값 텍스트 (DOM 캡처 대신 직접 렌더)
        g.fillStyle = rgba(textC, 1, 1);
        g.font = '700 ' + Math.round(0.11 * s) + 'px sans-serif';
        g.textAlign = 'right';
        g.fillText(valueText(), sx(0.95), sy(-0.22));
      }

      function ropePath(g2, sx, yFn) {
        g2.beginPath();
        g2.moveTo(sx(rope.px[0]), yFn(rope.py[0], 0));
        for (var i = 1; i < N - 1; i++) {
          var mx = (rope.px[i] + rope.px[i + 1]) / 2;
          g2.quadraticCurveTo(sx(rope.px[i]), yFn(rope.py[i], i),
            sx(mx), (yFn(rope.py[i], i) + yFn(rope.py[i + 1], i + 1)) / 2);
        }
        g2.lineTo(sx(rope.px[N - 1]), yFn(rope.py[N - 1], N - 1));
      }
      function roundRect(g2, x, y, w, h, r) {
        g2.beginPath();
        g2.moveTo(x + r, y);
        g2.arcTo(x + w, y, x + w, y + h, r);
        g2.arcTo(x + w, y + h, x, y + h, r);
        g2.arcTo(x, y + h, x, y, r);
        g2.arcTo(x, y, x + w, y, r);
        g2.closePath();
      }
      function rgba(c, a, mul) {
        return 'rgba(' + Math.round(Math.min(255, c.r * 255 * mul)) + ',' +
          Math.round(Math.min(255, c.g * 255 * mul)) + ',' +
          Math.round(Math.min(255, c.b * 255 * mul)) + ',' + a + ')';
      }

      raf = requestAnimationFrame(frame2d);
    }

    /* ── 경로 선택 ── */
    var cleanupFns = [];
    if (navigator.gpu && typeof navigator.gpu.requestAdapter === 'function') {
      startWebGPU();
    } else {
      start2DFallback('WebGPU 미지원');
    }

    var api = {
      destroy: function () {
        destroyed = true;
        cancelAnimationFrame(raf);
        if (ro) ro.disconnect();
        range.removeEventListener('input', onInput);
        range.removeEventListener('focus', updateColors);
        range.removeEventListener('blur', updateColors);
        mediaListeners.forEach(function (p) {
          try { p[0].removeEventListener('change', p[1]); } catch (e) { /* 무시 */ }
        });
        cleanupFns.forEach(function (fn) { try { fn(); } catch (e) { /* 무시 */ } });
        wrap.remove();
      },
      setArch: function (v) { if (!motionMedia.matches) rope.archStrength = v; },
      setDamping: function (v) { if (!motionMedia.matches) rope.damping = v; },
      setJellyColor: function (hex) {
        if (hex == null) { colorOverride = null; }
        else {
          colorOverride = {
            r: parseInt(hex.slice(1, 3), 16) / 255,
            g: parseInt(hex.slice(3, 5), 16) / 255,
            b: parseInt(hex.slice(5, 7), 16) / 255,
            a: 1,
          };
        }
        updateColors();
      },
    };
    return api;
  }

  /* ───────── knobs ───────── */

  function knobs(el, api) {
    var box = document.createElement('div');
    box.className = 'ojelly-knobs';
    box.innerHTML =
      '<div><label>아치 강도 <span data-v="arch">2.0</span></label>' +
      '<input data-k="arch" type="range" min="0" max="4" step="0.1" value="2"></div>' +
      '<div><label>감쇠 <span data-v="damp">0.01</span></label>' +
      '<input data-k="damp" type="range" min="0" max="0.3" step="0.01" value="0.01"></div>' +
      '<div><label>젤리 색</label>' +
      '<input data-k="color" type="color" value="#ff7313"></div>' +
      '<div><button type="button" data-k="reset" class="cui-btn">테마 색 복원</button></div>';
    el.appendChild(box);
    box.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k');
      if (k === 'arch') {
        api.setArch(Number(e.target.value));
        box.querySelector('[data-v="arch"]').textContent = Number(e.target.value).toFixed(1);
      } else if (k === 'damp') {
        api.setDamping(Number(e.target.value));
        box.querySelector('[data-v="damp"]').textContent = Number(e.target.value).toFixed(2);
      } else if (k === 'color') {
        api.setJellyColor(e.target.value);
      }
    });
    box.addEventListener('click', function (e) {
      if (e.target.getAttribute('data-k') === 'reset') api.setJellyColor(null);
    });
  }

  /* ───────── 등록 ───────── */

  var CODE = [
    "// 핵심 메커니즘: DOM → WebGPU 텍스처 → 셰이더 젤리 변형",
    "// 1) 진짜 <input type=range>가 컨트롤 (opacity:0, 네이티브 포커스·키보드 유지)",
    "// 2) 값 표시 div를 paint 핸들러 안에서 GPU 텍스처로 캡처",
    "canvas.addEventListener('paint', () => {",
    "  device.queue.copyElementImageToTexture(",
    "    { source: valueEl },",
    "    { destination: { texture: valueTex }, width: 736, height: 128 });",
    "});",
    "// rAF에서는 요청만 — 값이 바뀔 때 canvas.requestPaint()",
    "slider.addEventListener('input', () => canvas.requestPaint());",
    "",
    "// 3) CPU 버렛 로프 물리(17점: 거리·굽힘 제약 + 아치 바이어스)",
    "//    → 점 배열을 storage 버퍼로 매 프레임 업로드",
    "rope.update(dt);",
    "queue.writeBuffer(ptsBuf, 0, new Float32Array(points));",
    "",
    "// 4) WGSL 레이마치: 캡슐 체인 SDF + z 압출 = 젤리,",
    "//    프레넬(IOR 1.42) + 굴절 + Beer-Lambert 흡수 + 산란.",
    "//    바닥 셰이딩에서 캡처한 valueTex를 샘플링해 퍼센트를 새김.",
    "// 5) 색은 CSS에서: getComputedStyle(slider).color — :focus/다크/강제색 대응",
    "// 폴백: WebGPU 실패 시 같은 로프 물리를 2D 캔버스로 유사 변형 렌더",
  ].join('\n');

  window.CUIDocs.register({
    id: ID,
    name: '젤리 슬라이더',
    emoji: '🍮',
    section: 'official',
    oneLiner: '슬라이더 DOM을 GPU 텍스처로 캡처, 젤리 변형 (공식 데모 이식)',
    code: CODE,
    mount: mount,
    knobs: knobs,
  });
})();
