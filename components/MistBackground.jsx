'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * MistBackground
 * Fixed, full-viewport fragment shader: drifting blue mist (domain-warped fbm)
 * with soft out-of-focus floral rosettes (polar rose petals) that float inside
 * it. Palette: black / emerald base, ivory highlights, vermilion hints.
 * Scroll shifts the field slightly for depth; pointer adds gentle parallax.
 */
export default function MistBackground() {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uScroll: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        uniform vec2 uRes;
        uniform float uScroll;
        uniform vec2 uMouse;

        float hash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                     mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + 7.3; a *= 0.5; }
          return v;
        }

        // Soft floral rosette: petals via polar rose r = cos(k*theta)
        float flower(vec2 p, float petals, float size, float soft) {
          float r = length(p);
          float a = atan(p.y, p.x);
          float petal = 0.55 + 0.45 * cos(a * petals);
          float shape = smoothstep(size * petal + soft, size * petal - soft, r);
          float core = smoothstep(size * 0.22, 0.0, r);
          return shape * 0.8 + core * 0.5;
        }

        void main() {
          vec2 uv = vUv;
          float aspect = uRes.x / uRes.y;
          vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
          float t = uTime * 0.045;

          // domain-warped mist
          vec2 q = vec2(fbm(p * 1.6 + t), fbm(p * 1.6 - t + 4.0));
          vec2 r2 = vec2(fbm(p * 2.2 + q * 1.8 + t * 1.3), fbm(p * 2.2 + q * 1.8 - t));
          float mist = fbm(p * 1.4 + r2 * 1.6);

          // base: black into emerald depths
          vec3 black = vec3(0.020, 0.045, 0.036);
          vec3 emerald = vec3(0.040, 0.240, 0.185);
          vec3 col = mix(black, emerald, smoothstep(0.15, 0.95, mist) * 0.85);

          // blue mist veil
          vec3 blue = vec3(0.34, 0.52, 0.86);
          float veil = smoothstep(0.38, 0.88, mist + r2.x * 0.35);
          col = mix(col, blue * 0.62, veil * 0.55);

          // floating florals (3 depth layers of tiled rosettes, blurred)
          float fl = 0.0;
          for (int L = 0; L < 3; L++) {
            float fL = float(L);
            float scale = 2.2 + fL * 1.5;
            vec2 g = p * scale;
            g.y += uScroll * (0.35 + fL * 0.25) + t * (1.2 + fL);
            g.x += sin(t * 3.0 + fL) * 0.25 + uMouse.x * (0.15 + fL * 0.1);
            vec2 id = floor(g);
            vec2 f = fract(g) - 0.5;
            float h = hash(id + fL * 19.7);
            vec2 off = (vec2(hash(id + 3.1), hash(id + 8.7)) - 0.5) * 0.45;
            float ang = h * 6.2831 + t * (h - 0.5) * 4.0;
            vec2 rf = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (f - off);
            float petals = 5.0 + floor(h * 4.0);
            float blur = 0.10 + fL * 0.05;
            float present = step(0.42, h);
            fl += flower(rf, petals, 0.30 + h * 0.10, blur) * present * (0.55 - fL * 0.12);
          }
          vec3 petalCol = mix(vec3(0.74, 0.85, 1.0), vec3(0.97, 0.95, 0.88), noise(p * 3.0 + t));
          col += petalCol * fl * 0.20 * (0.5 + mist);

          // tiny vermilion warmth drifting through the mist
          float warm = smoothstep(0.62, 0.95, fbm(p * 1.1 - r2 * 1.4 + 11.0));
          col += vec3(0.91, 0.27, 0.18) * warm * 0.10;

          // ivory haze highlight
          col += vec3(0.97, 0.95, 0.88) * pow(max(mist - 0.55, 0.0), 2.0) * 0.55;

          // vignette to black
          float vig = smoothstep(1.15, 0.25, length((uv - 0.5) * vec2(1.0, 1.1)));
          col *= mix(0.45, 1.0, vig);

          // dither to avoid banding
          col += (hash(gl_FragCoord.xy + uTime) - 0.5) / 255.0;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    const mouse = { x: 0, y: 0 };
    const mouseSm = { x: 0, y: 0 };
    let scrollSm = 0;

    const onMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let raf;
    function tick() {
      raf = requestAnimationFrame(tick);
      const t = reduced ? 0 : clock.getElapsedTime();
      mouseSm.x += (mouse.x - mouseSm.x) * 0.04;
      mouseSm.y += (mouse.y - mouseSm.y) * 0.04;
      scrollSm += (window.scrollY / window.innerHeight - scrollSm) * 0.06;
      uniforms.uTime.value = t;
      uniforms.uScroll.value = scrollSm * 0.12;
      uniforms.uMouse.value.set(mouseSm.x, mouseSm.y);
      renderer.render(scene, camera);
    }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', onResize);
      quad.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        background: '#050c09',
      }}
    />
  );
}
