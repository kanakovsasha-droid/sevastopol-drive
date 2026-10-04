import * as THREE from 'three';
import { ENV } from './env.js?v=d41c04b3';

// Снегопад и дождь: облако точек в коробке 70 м вокруг камеры.
//
// Всё движение считает вершинный шейдер: точка падает по времени и по модулю
// заворачивается в коробку вокруг камеры, так что частицы бесконечны, а CPU
// не трогает ни одной. Снежинка — мягкий кружок, покачивается на ветру;
// капля — тонкий косой штрих внутри квадрата точки.

const N = 16000, BOX = 70;

const VERT = `
  uniform float uTime, uAmt, uRain, uScale;
  uniform vec3 uCam;
  attribute vec4 aSeed;
  varying float vA;
  void main(){
    vec3 p = aSeed.xyz * ${BOX.toFixed(1)};
    float t = uTime * (1.0 + aSeed.w * 0.4);
    float fall = mix(1.1, 10.5, uRain);
    p.y -= t * fall;
    // снег кружит, дождь сносит ветром
    p.x += mix(sin(uTime * 0.6 + aSeed.w * 40.0) * 0.9, -t * 1.6, uRain);
    p.z += mix(cos(uTime * 0.5 + aSeed.x * 30.0) * 0.9, -t * 0.6, uRain);
    // в коробку вокруг камеры
    p = mod(p - uCam + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)} + uCam;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // не всё сразу: сила осадков — доля видимых частиц
    vA = step(aSeed.w, uAmt) * smoothstep(${(BOX / 2).toFixed(1)}, 8.0, length(mv.xyz));
    gl_PointSize = mix(0.09, 0.9, uRain) * uScale / max(0.5, -mv.z) * vA;
  }`;

const FRAG = `
  uniform float uRain, uBright;
  varying float vA;
  void main(){
    if (vA < 0.01) discard;
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uRain > 0.5) {
      // штрих: узкий по x, с наклоном под ветер
      float x = c.x + c.y * 0.15;
      a = (1.0 - smoothstep(0.02, 0.06, abs(x))) * (1.0 - smoothstep(0.35, 0.5, abs(c.y))) * 0.35;
    } else {
      a = 1.0 - smoothstep(0.25, 0.5, length(c));
    }
    if (a < 0.02) discard;
    vec3 col = mix(vec3(1.0), vec3(0.72, 0.78, 0.86), uRain) * uBright;
    gl_FragColor = vec4(col, a * vA);
  }`;

export class Precip {
  constructor(scene) {
    const g = new THREE.BufferGeometry();
    const S = new Float32Array(N * 4);
    for (let i = 0; i < S.length; i++) S[i] = Math.random();
    g.setAttribute('aSeed', new THREE.BufferAttribute(S, 4));
    // позиции не нужны (их считает шейдер), но three хочет атрибут position
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: ENV.uTime, uAmt: { value: 0 }, uRain: { value: 0 }, uScale: { value: 600 },
        uCam: { value: new THREE.Vector3() }, uBright: { value: 1 },
      },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: false,
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 4;
    this.pts.visible = false;
    scene.add(this.pts);
  }

  // kind — 'snow' | 'rain' | null; amt — 0..1; bright — сколько света (ночью тусклее)
  update(camera, renderer, kind, amt, bright) {
    const on = !!kind && amt > 0.01;
    this.pts.visible = on;
    if (!on) return;
    const U = this.mat.uniforms;
    U.uCam.value.copy(camera.position);
    U.uAmt.value = amt;
    U.uRain.value = kind === 'rain' ? 1 : 0;
    U.uBright.value = bright;
    U.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
  }
}
