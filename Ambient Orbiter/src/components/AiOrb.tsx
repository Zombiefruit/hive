import React, { useRef } from "react";
import { Canvas, useFrame, extend } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

class PortalMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uIntensity: { value: 0 },
        uEscalationMix: { value: 0 },
      },
      vertexShader: `
        varying vec3 vLocalDir;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        void main() {
          vLocalDir = normalize(position);
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vLocalDir;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;

        uniform float uIntensity;
        uniform float uEscalationMix;

        float hash31(vec3 p) {
          p = fract(p * vec3(0.1031, 0.1030, 0.0973));
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }

        vec3 hash33(vec3 p) {
          return vec3(
            hash31(p + vec3(1.0, 0.0, 0.0)),
            hash31(p + vec3(0.0, 1.0, 0.0)),
            hash31(p + vec3(0.0, 0.0, 1.0))
          );
        }

        float hash21(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        vec2 hash22(vec2 p) {
          return vec2(
            hash21(p + vec2(1.0, 0.0)),
            hash21(p + vec2(0.0, 1.0))
          );
        }

        float starLayer(vec3 dir, float density, vec3 seed, float threshold, float radius, float brightness) {
          vec3 p = dir * density + seed;
          vec3 baseCell = floor(p);
          vec3 cellUv = fract(p) - 0.5;
          float layer = 0.0;

          for (int xi = -1; xi <= 1; xi++) {
            for (int yi = -1; yi <= 1; yi++) {
              for (int zi = -1; zi <= 1; zi++) {
                vec3 offset = vec3(float(xi), float(yi), float(zi));
                vec3 cell = baseCell + offset;
                float h = hash31(cell + seed * 1.37);

                if (h > threshold) {
                  vec3 localStar = hash33(cell + seed * 2.11) - 0.5;
                  vec3 delta = cellUv - offset - localStar;
                  float dist = length(delta);
                  float hero = step(0.985, h);
                  float starRadius = mix(radius, radius * 1.08, hero);
                  float starBrightness = mix(brightness, brightness * 1.8, hero);
                  float core = exp(-(dist * dist) / max(starRadius * starRadius * 0.12, 0.0001));
                  float halo = exp(-(dist * dist) / max(starRadius * starRadius * 1.0, 0.0001)) * 0.25;
                  layer = max(layer, core * starBrightness * 2.2 + halo * starBrightness);
                }
              }
            }
          }

          return layer;
        }

        float projectedStarLayer(vec2 uv, float density, vec2 seed, float threshold, float radius, float brightness) {
          vec2 p = uv * density + seed;
          vec2 baseCell = floor(p);
          vec2 cellUv = fract(p) - 0.5;
          float layer = 0.0;

          for (int xi = -1; xi <= 1; xi++) {
            for (int yi = -1; yi <= 1; yi++) {
              vec2 offset = vec2(float(xi), float(yi));
              vec2 cell = baseCell + offset;
              float h = hash21(cell + seed * 1.73);

              if (h > threshold) {
                vec2 localStar = hash22(cell + seed * 2.31) - 0.5;
                vec2 delta = cellUv - offset - localStar;
                float dist = length(delta);
                float hero = step(0.985, h);
                float starRadius = mix(radius, radius * 1.08, hero);
                float starBrightness = mix(brightness, brightness * 1.6, hero);
                float core = exp(-(dist * dist) / max(starRadius * starRadius * 0.10, 0.0001));
                float halo = exp(-(dist * dist) / max(starRadius * starRadius * 0.9, 0.0001)) * 0.28;
                layer = max(layer, core * starBrightness * 2.4 + halo * starBrightness);
              }
            }
          }

          return layer;
        }

        void main() {
          vec3 dir = normalize(vLocalDir);
          float viewFacing = pow(max(dot(normalize(cameraPosition - vWorldPosition), vNormal), 0.0), 2.6);
          float projectedRadius = clamp(length(dir.xy), 0.0, 1.0);
          float centerMask = 1.0 - smoothstep(0.2, 0.82, projectedRadius);
          vec2 portalUv = dir.xy / max(dir.z + 1.15, 0.9);

          float starField = 0.0;
          starField += starLayer(dir, 6.0, vec3(0.0, 0.0, 0.0), 0.76, 0.09, 1.35);
          starField += starLayer(dir, 10.0, vec3(7.2, 1.3, 4.7), 0.80, 0.062, 0.95);
          starField += starLayer(dir, 15.0, vec3(2.4, 8.1, 3.6), 0.84, 0.042, 0.58);
          starField += projectedStarLayer(portalUv, 10.0, vec2(3.2, 5.6), 0.82, 0.065, 1.1) * centerMask * 1.45;
          starField += projectedStarLayer(portalUv * 1.42, 15.0, vec2(8.4, 1.9), 0.89, 0.042, 0.82) * centerMask * 1.2;
          starField *= mix(1.24, 0.98, smoothstep(0.48, 0.98, projectedRadius));
          starField = min(starField, 9.8);

          float colorHash = hash31(floor(dir * 18.0));
          vec3 coldStar = mix(vec3(0.78, 0.88, 1.0), vec3(1.0, 1.0, 1.0), colorHash);
          vec3 warmStar = vec3(1.0, 0.78, 0.48);
          vec3 starColor = mix(coldStar, warmStar, uEscalationMix * 0.25);

          vec3 voidColor = vec3(0.004, 0.004, 0.018) + vec3(0.0, 0.005, 0.012) * uIntensity * 0.04;
          vec3 starlight = starColor * starField * (1.52 + viewFacing * 0.6 + centerMask * 1.05);
          vec3 hdrBloom = starColor * pow(starField, 1.08) * (0.08 + centerMask * 0.04);
          vec3 finalColor = voidColor + starlight + hdrBloom;

          gl_FragColor = vec4(finalColor, 0.98);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }
}

class NebulaShellMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
        uColor1: { value: new THREE.Color("hsl(222, 100%, 64%)") },
        uColor2: { value: new THREE.Color("hsl(268, 88%, 66%)") },
        uColor3: { value: new THREE.Color("hsl(196, 92%, 60%)") },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vLocalPos;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uIntensity;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x = x_ * ns.x + ns.yyyy;
          vec4 y = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);
          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);
          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
        }

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vLocalPos = normalize(position);
          vUv = uv;
          float noiseA = snoise(position * 1.0 + uTime * 0.14) * 0.045;
          float noiseB = snoise(position * 2.2 + uTime * 0.22) * 0.02;
          float displacement = (noiseA + noiseB) * (1.0 + uIntensity * 0.3);
          vec3 displaced = position + normal * displacement;
          vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vLocalPos;
        varying vec3 vWorldPosition;
        varying vec2 vUv;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform vec3 uColor3;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float facing = max(dot(viewDir, normalize(vNormal)), 0.0);
          float fresnel = pow(1.0 - facing, 2.4);

          float radialDistance = clamp(length(vLocalPos.xy), 0.0, 1.0);
          float radialMask = smoothstep(0.62, 0.92, radialDistance);
          float edgeMask = smoothstep(0.58, 0.95, radialDistance);

          float noiseA = sin((vUv.x + vUv.y) * 4.2 + uTime * 0.08) * 0.5 + 0.5;
          float noiseB = cos((vUv.x - vUv.y) * 3.6 - uTime * 0.06) * 0.5 + 0.5;
          float blendNoise = smoothstep(0.2, 0.8, noiseA * 0.65 + noiseB * 0.35);

          vec3 shellColor = mix(uColor1, uColor2, blendNoise);
          shellColor = mix(shellColor, uColor3, smoothstep(0.35, 0.78, noiseB) * 0.22);
          vec3 edgeGlow = mix(uColor1, uColor3, fresnel) * 3.5 * edgeMask;
          vec3 finalColor = shellColor * radialMask * 0.35 + edgeGlow * (0.22 + fresnel * 0.9);
          finalColor *= 1.0 + uIntensity * 0.2;

          float alpha = clamp(radialMask * 0.25 + edgeMask * fresnel * 0.35, 0.0, 0.65);
          if (alpha < 0.002) discard;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
    });
  }
}

class GlowRimMaterial extends THREE.ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        uColor: { value: new THREE.Color("hsl(222, 100%, 64%)") },
        uOpacity: { value: 0.12 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vLocalPos;
        varying vec3 vWorldPosition;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vLocalPos = normalize(position);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vLocalPos;
        varying vec3 vWorldPosition;

        uniform vec3 uColor;
        uniform float uOpacity;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float facing = max(dot(viewDir, normalize(vNormal)), 0.0);
          float fresnel = pow(1.0 - facing, 1.8);
          float radialDistance = clamp(length(vLocalPos.xy), 0.0, 1.0);
          float rimMask = smoothstep(0.7, 0.98, radialDistance);
          float alpha = fresnel * rimMask * uOpacity;
          vec3 color = uColor * rimMask * (0.5 + fresnel * 2.8);

          if (alpha < 0.002) discard;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    });
  }
}

extend({ PortalMaterial, NebulaShellMaterial, GlowRimMaterial });

declare global {
  namespace JSX {
    interface IntrinsicElements {
      portalMaterial: any;
      nebulaShellMaterial: any;
      glowRimMaterial: any;
    }
  }
}

const PortalCore = ({ intensity, isEscalation }: { intensity: number; isEscalation: boolean }) => {
  const materialRef = useRef<PortalMaterial>(null!);

  useFrame(() => {
    if (!materialRef.current) return;
    const targetIntensity = isEscalation ? 1.5 : intensity;
    materialRef.current.uniforms.uIntensity.value += (targetIntensity - materialRef.current.uniforms.uIntensity.value) * 0.05;
    const escalationTarget = isEscalation ? 1 : 0;
    materialRef.current.uniforms.uEscalationMix.value += (escalationTarget - materialRef.current.uniforms.uEscalationMix.value) * 0.05;
  });

  return (
    <Sphere args={[0.92, 96, 96]}>
      <portalMaterial ref={materialRef} />
    </Sphere>
  );
};

const _normalColor1 = new THREE.Color("hsl(222, 100%, 64%)");
const _normalColor2 = new THREE.Color("hsl(268, 88%, 66%)");
const _normalColor3 = new THREE.Color("hsl(196, 92%, 60%)");
const _escalColor1 = new THREE.Color("hsl(18, 100%, 62%)");
const _escalColor2 = new THREE.Color("hsl(2, 100%, 63%)");
const _escalColor3 = new THREE.Color("hsl(38, 100%, 58%)");
const _glowNormal = new THREE.Color("hsl(222, 100%, 64%)");
const _glowEscal = new THREE.Color("hsl(18, 100%, 62%)");

const NebulaShell = ({ intensity, isEscalation }: { intensity: number; isEscalation: boolean }) => {
  const meshRef = useRef<THREE.Mesh>(null!);
  const materialRef = useRef<NebulaShellMaterial>(null!);

  useFrame((state) => {
    if (!materialRef.current || !meshRef.current) return;
    const t = state.clock.elapsedTime;
    materialRef.current.uniforms.uTime.value = t;
    const targetIntensity = isEscalation ? 2 : intensity;
    materialRef.current.uniforms.uIntensity.value += (targetIntensity - materialRef.current.uniforms.uIntensity.value) * 0.05;
    const smoothIntensity = materialRef.current.uniforms.uIntensity.value;

    const t1 = isEscalation ? _escalColor1 : _normalColor1;
    const t2 = isEscalation ? _escalColor2 : _normalColor2;
    const t3 = isEscalation ? _escalColor3 : _normalColor3;
    materialRef.current.uniforms.uColor1.value.lerp(t1, 0.008);
    materialRef.current.uniforms.uColor2.value.lerp(t2, 0.008);
    materialRef.current.uniforms.uColor3.value.lerp(t3, 0.008);

    const breathe = 1.0 + Math.sin(t * 1.85) * 0.065 + Math.sin(t * 3.1) * 0.025;
    const pulse = smoothIntensity > 0.01 ? Math.sin(t * 2.8) * 0.028 * smoothIntensity : 0.0;
    const scale = breathe + pulse;
    meshRef.current.scale.setScalar(scale);
  });

  return (
    <Sphere ref={meshRef} args={[1, 128, 128]}>
      <nebulaShellMaterial ref={materialRef} />
    </Sphere>
  );
};

const GlowLayers = ({ isEscalation }: { isEscalation: boolean }) => {
  const innerRef = useRef<THREE.Mesh>(null!);
  const outerRef = useRef<THREE.Mesh>(null!);
  const innerMaterialRef = useRef<GlowRimMaterial>(null!);
  const outerMaterialRef = useRef<GlowRimMaterial>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    innerRef.current.scale.setScalar(1.1 + Math.sin(t * 0.9) * 0.02);
    outerRef.current.scale.setScalar(1.28 + Math.sin(t * 0.6) * 0.035);
    const glowTarget = isEscalation ? _glowEscal : _glowNormal;
    innerMaterialRef.current.uniforms.uColor.value.lerp(glowTarget, 0.008);
    outerMaterialRef.current.uniforms.uColor.value.lerp(glowTarget, 0.008);
    innerMaterialRef.current.uniforms.uOpacity.value = 0.26;
    outerMaterialRef.current.uniforms.uOpacity.value = 0.14;
  });

  return (
    <>
      <Sphere ref={innerRef} args={[1, 32, 32]}>
        <glowRimMaterial ref={innerMaterialRef} />
      </Sphere>
      <Sphere ref={outerRef} args={[1, 32, 32]}>
        <glowRimMaterial ref={outerMaterialRef} />
      </Sphere>
    </>
  );
};

interface AiOrbProps {
  intensity: number;
  isEscalation: boolean;
  size?: number;
}

const AiOrb: React.FC<AiOrbProps> = ({ intensity, isEscalation, size = 120 }) => {
  return (
    <div style={{ width: size, height: size }} className="pointer-events-auto">
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 45 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.25} />
        <pointLight position={[2, 2, 4]} intensity={1.4} color="hsl(0, 0%, 100%)" />
        <pointLight position={[-2, -1, 3]} intensity={0.65} color={isEscalation ? "hsl(18, 100%, 62%)" : "hsl(222, 100%, 64%)"} />
        <PortalCore intensity={intensity} isEscalation={isEscalation} />
        <NebulaShell intensity={intensity} isEscalation={isEscalation} />
        <GlowLayers isEscalation={isEscalation} />
      </Canvas>
    </div>
  );
};

export default AiOrb;
