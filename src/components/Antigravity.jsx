/* eslint-disable react/no-unknown-property */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Component, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

class MediaErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

function isVideoUrl(url) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

function normalizeMediaItem(item) {
  if (typeof item === 'string') {
    return { src: item, blendMode: 'normal', scale: 1 };
  }
  return {
    src: item.src,
    blendMode: item.blendMode || 'normal',
    scale: item.scale ?? 1
  };
}

/** Photoshop-style Screen: blacks drop out, lights composite over the scene */
function getBlendMaterialProps(blendMode) {
  if (blendMode === 'screen') {
    return {
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor
    };
  }

  return {
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    blending: THREE.NormalBlending
  };
}

/** Longest side of each media plane in world units */
const MEDIA_LONG_SIDE = 9.1;
/** Idle before one-at-a-time centered showcase */
const IDLE_AFTER_MS = 2000;
/** How long each asset stays centered while idle */
const FEATURE_HOLD_MS = 4000;

function createMediaBodies(count, width, height) {
  const temp = [];
  const w = width || 30;
  const h = height || 20;
  // Guaranteed spread so each media gets a distinct orbit angle around the cursor
  for (let i = 0; i < count; i++) {
    const slot = (i / count) * Math.PI * 2 + Math.PI / count;
    const radius = Math.min(w, h) * 0.45;
    const x = Math.cos(slot) * radius;
    const y = Math.sin(slot) * radius;
    const z = (Math.random() - 0.5) * 8;
    temp.push({
      t: Math.random() * 100,
      speed: 0.01 + Math.random() / 200,
      mx: x,
      my: y,
      mz: z,
      cx: x,
      cy: y,
      cz: z,
      scale: 1,
      // Stable base angle — keeps pieces from collapsing to one spot
      baseAngle: slot,
      randomRadiusOffset: (Math.random() - 0.5) * 2
    });
  }
  return temp;
}

function getMediaPlaneSize(texture) {
  const src = texture?.image;
  const w = src?.videoWidth || src?.naturalWidth || src?.width || 1;
  const h = src?.videoHeight || src?.naturalHeight || src?.height || 1;
  const aspect = w / h;
  if (aspect >= 1) {
    return [MEDIA_LONG_SIDE, MEDIA_LONG_SIDE / aspect];
  }
  return [MEDIA_LONG_SIDE * aspect, MEDIA_LONG_SIDE];
}

function loadMediaTexture(url) {
  if (isVideoUrl(url)) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = url;
      video.crossOrigin = 'anonymous';
      video.loop = true;
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');

      const onReady = () => {
        if (!video.videoWidth || !video.videoHeight) return;
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('loadedmetadata', onReady);
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        video.play().catch(() => {});
        resolve({ texture, video, width: video.videoWidth, height: video.videoHeight });
      };

      video.addEventListener('loadedmetadata', onReady);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('error', () => reject(new Error(`Failed to load video: ${url}`)));
      video.load();
    });
  }

  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        const img = texture.image;
        resolve({
          texture,
          video: null,
          width: img?.naturalWidth || img?.width || 1,
          height: img?.naturalHeight || img?.height || 1
        });
      },
      undefined,
      () => reject(new Error(`Failed to load image: ${url}`))
    );
  });
}

function useMediaTextures(urls) {
  const [items, setItems] = useState(null);
  const urlsKey = urls.join('|');

  useEffect(() => {
    let cancelled = false;
    const videos = [];

    Promise.all(urls.map(loadMediaTexture))
      .then(loaded => {
        if (cancelled) {
          loaded.forEach(({ texture, video }) => {
            texture.dispose();
            if (video) {
              video.pause();
              video.src = '';
            }
          });
          return;
        }
        loaded.forEach(({ video }) => {
          if (video) videos.push(video);
        });
        setItems(loaded);
      })
      .catch(err => {
        console.error(err);
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
      videos.forEach(video => {
        video.pause();
        video.removeAttribute('src');
        video.load();
      });
    };
  }, [urlsKey]);

  return items;
}

function MediaField({
  images,
  color = '#ffffff',
  count,
  magnetRadius = 10,
  ringRadius = 10,
  waveSpeed = 0.4,
  waveAmplitude = 1,
  lerpSpeed = 0.1,
  autoAnimate = false,
  particleVariance = 1,
  rotationSpeed = 0,
  depthFactor = 1,
  pulseSpeed = 3,
  fieldStrength = 10
}) {
  const mediaSpecs = useMemo(
    () => images.map(normalizeMediaItem),
    [images]
  );
  const mediaUrls = useMemo(
    () => mediaSpecs.map(item => item.src),
    [mediaSpecs]
  );
  const mediaItems = useMediaTextures(mediaUrls);
  const meshRefs = useRef([]);
  const { viewport } = useThree();

  const lastMousePos = useRef({ x: 0, y: 0 });
  const lastMouseMoveTime = useRef(Date.now());
  const hasPointerInput = useRef(false);
  const virtualMouse = useRef({ x: 0, y: 0 });
  const idleMode = useRef(true);
  const idleStartedAt = useRef(Date.now());

  const mediaCount = mediaItems
    ? Math.min(count ?? mediaSpecs.length, mediaItems.length)
    : 0;

  const planeSizes = useMemo(() => {
    if (!mediaItems) return [];
    return mediaItems.map((item, i) => {
      const longSide = MEDIA_LONG_SIDE * (mediaSpecs[i]?.scale ?? 1);
      const aspect = (item.width || 1) / (item.height || 1);
      if (aspect >= 1) {
        return [longSide, longSide / aspect];
      }
      return [longSide * aspect, longSide];
    });
  }, [mediaItems, mediaSpecs]);

  const bodies = useMemo(
    () => createMediaBodies(mediaCount || 1, viewport.width || 30, viewport.height || 20),
    [mediaCount, viewport.width, viewport.height]
  );

  useFrame(() => {
    if (!mediaItems) return;
    mediaItems.forEach(({ texture, video }) => {
      if (video && video.paused) {
        video.play().catch(() => {});
      }
      if (texture.isVideoTexture) {
        texture.needsUpdate = true;
      }
    });
  });

  useFrame(state => {
    if (!mediaItems || mediaCount === 0) return;

    const { viewport: v, pointer: m } = state;

    const mouseDist = Math.hypot(m.x - lastMousePos.current.x, m.y - lastMousePos.current.y);
    if (mouseDist > 0.001) {
      lastMouseMoveTime.current = Date.now();
      lastMousePos.current = { x: m.x, y: m.y };
      hasPointerInput.current = true;
    }

    // Align media with circular text at true viewport center
    const centerY = 0;
    const now = Date.now();
    const isIdle =
      !hasPointerInput.current || now - lastMouseMoveTime.current > IDLE_AFTER_MS;

    if (isIdle && !idleMode.current) {
      idleMode.current = true;
      idleStartedAt.current = now;
    } else if (!isIdle && idleMode.current) {
      idleMode.current = false;
    }

    let destX = 0;
    let destY = centerY;

    if (!isIdle && hasPointerInput.current) {
      destX = (m.x * v.width) / 2;
      destY = (m.y * v.height) / 2 + centerY;
    }

    // Original Antigravity mouse smoothing
    const smoothFactor = 0.05;
    virtualMouse.current.x += (destX - virtualMouse.current.x) * smoothFactor;
    virtualMouse.current.y += (destY - virtualMouse.current.y) * smoothFactor;

    const targetX = virtualMouse.current.x;
    const targetY = virtualMouse.current.y;
    const globalRotation = state.clock.getElapsedTime() * rotationSpeed;
    const featuredIndex = isIdle
      ? Math.floor((now - idleStartedAt.current) / FEATURE_HOLD_MS) % mediaCount
      : -1;

    for (let i = 0; i < mediaCount; i++) {
      const mesh = meshRefs.current[i];
      const body = bodies[i];
      if (!mesh || !body) continue;

      let { t, speed, mx, my, mz, cz, randomRadiusOffset, baseAngle } = body;
      t = body.t += speed / 2;

      let targetPos = { x: mx, y: my, z: mz * depthFactor };
      let targetScale = 1;

      if (isIdle) {
        // One media at a time, centered — others scale out
        targetPos = { x: 0, y: centerY, z: 0 };
        targetScale = i === featuredIndex ? 1 : 0;
      } else {
        const projectionFactor = 1 - cz / 50;
        const projectedTargetX = targetX * projectionFactor;
        const projectedTargetY = targetY * projectionFactor;

        // Mouse-relative angle (original) + unique base slot so pieces stay independent
        const dx = mx - projectedTargetX;
        const dy = my - projectedTargetY;
        const mouseAngle = Math.atan2(dy, dx);
        const dist = Math.hypot(dx, dy);

        if (dist < magnetRadius) {
          // Blend unique home angle with mouse angle — each piece moves differently
          const angle = baseAngle * 0.55 + mouseAngle * 0.45 + globalRotation;
          const wave = Math.sin(t * waveSpeed + angle) * (0.5 * waveAmplitude);
          const deviation = randomRadiusOffset * (5 / (fieldStrength + 0.1));
          const currentRingRadius = ringRadius + wave + deviation;

          targetPos = {
            x: projectedTargetX + currentRingRadius * Math.cos(angle),
            y: projectedTargetY + currentRingRadius * Math.sin(angle),
            z: mz * depthFactor + Math.sin(t) * waveAmplitude * depthFactor
          };
        }
      }

      body.cx += (targetPos.x - body.cx) * lerpSpeed;
      body.cy += (targetPos.y - body.cy) * lerpSpeed;
      body.cz += (targetPos.z - body.cz) * lerpSpeed;
      body.scale += (targetScale - body.scale) * lerpSpeed;

      mesh.position.set(body.cx, body.cy, body.cz);
      mesh.quaternion.copy(state.camera.quaternion);
      mesh.renderOrder = i === featuredIndex ? mediaCount : i;
      mesh.scale.setScalar(Math.max(0, body.scale));
      mesh.visible = body.scale > 0.01;
    }
  });

  if (!mediaItems) {
    return <LoadingScreen />;
  }

  return bodies.slice(0, mediaCount).map((_, i) => {
    const blendProps = getBlendMaterialProps(mediaSpecs[i]?.blendMode);
    return (
      <mesh
        key={mediaUrls[i]}
        ref={el => {
          meshRefs.current[i] = el;
        }}
        frustumCulled={false}
        scale={1}
      >
        <planeGeometry args={planeSizes[i] || [MEDIA_LONG_SIDE, MEDIA_LONG_SIDE]} />
        <meshBasicMaterial
          map={mediaItems[i].texture}
          color={color}
          side={THREE.DoubleSide}
          toneMapped={false}
          {...blendProps}
        />
      </mesh>
    );
  });
}

function LoadingScreen() {
  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[8, 1]} />
      <meshBasicMaterial color="#222222" />
    </mesh>
  );
}

export default function Antigravity({ images = [], ...props }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 50], fov: 35 }}
      style={{ width: '100%', height: '100%', display: 'block', background: '#000000' }}
      gl={{ alpha: false, antialias: true }}
    >
      <color attach="background" args={['#000000']} />
      <MediaErrorBoundary fallback={<LoadingScreen />}>
        <MediaField images={images} {...props} />
      </MediaErrorBoundary>
    </Canvas>
  );
}
