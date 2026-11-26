import { useEffect, useRef } from 'react';

/**
 * Escena decorativa ligera (three.js): carretera en perspectiva con niebla y partículas naranjas.
 * three se importa de forma diferida y no se monta si el usuario pide movimiento reducido.
 * Se pausa cuando la pestaña no está visible y libera GPU al desmontar.
 */
export default function LoginBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let raf = 0;
    let teardown: (() => void) | undefined;

    void import('three')
      .then((THREE) => {
        if (disposed) return;

        let renderer: InstanceType<typeof THREE.WebGLRenderer>;
        try {
          renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'low-power' });
        } catch {
          return; // Sin WebGL: el fondo CSS basta.
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setClearColor(0x000000, 0);

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0d0c0b, 7, 26);

        const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80);
        camera.position.set(0, 1.6, 6);
        camera.lookAt(0, 0.2, -10);

        // Carretera: rayas laterales fijas + travesaños que avanzan hacia la cámara.
        const orange = new THREE.LineBasicMaterial({ color: 0xf58a1f, transparent: true, opacity: 0.5 });
        const dim = new THREE.LineBasicMaterial({ color: 0xffd69e, transparent: true, opacity: 0.12 });

        const railPts: number[] = [];
        for (const x of [-3.2, 3.2]) railPts.push(x, 0, 4, x, 0, -60);
        const rails = new THREE.LineSegments(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(railPts, 3)),
          orange
        );
        orange.opacity = 0.38;
        scene.add(rails);

        const SPACING = 3;
        const CROSS_COUNT = 24;
        const crossPts: number[] = [];
        for (let i = 0; i < CROSS_COUNT; i++) {
          const z = 4 - i * SPACING;
          crossPts.push(-3.2, 0, z, 3.2, 0, z);
        }
        const crossGeo = new THREE.BufferGeometry().setAttribute(
          'position',
          new THREE.Float32BufferAttribute(crossPts, 3)
        );
        const cross = new THREE.LineSegments(crossGeo, dim);
        scene.add(cross);

        // Partículas flotando alrededor de la carretera.
        const COUNT = 220;
        const pPos = new Float32Array(COUNT * 3);
        for (let i = 0; i < COUNT; i++) {
          pPos[i * 3] = (Math.random() - 0.5) * 22;
          pPos[i * 3 + 1] = Math.random() * 7;
          pPos[i * 3 + 2] = -Math.random() * 40 + 4;
        }
        const pGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3));
        const pMat = new THREE.PointsMaterial({
          color: 0xffbb67,
          size: 0.045,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          sizeAttenuation: true,
        });
        const points = new THREE.Points(pGeo, pMat);
        scene.add(points);

        const resize = () => {
          const w = canvas.clientWidth || 1;
          const h = canvas.clientHeight || 1;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);

        // Parallax suave con el ratón / inclinación.
        const target = { x: 0, y: 0 };
        const onPointer = (e: PointerEvent) => {
          target.x = (e.clientX / window.innerWidth - 0.5) * 0.9;
          target.y = (e.clientY / window.innerHeight - 0.5) * 0.4;
        };
        window.addEventListener('pointermove', onPointer, { passive: true });

        const clock = new THREE.Clock();
        let running = true;
        const onVisibility = () => {
          running = !document.hidden;
          if (running) {
            clock.getDelta();
            loop();
          }
        };
        document.addEventListener('visibilitychange', onVisibility);

        const loop = () => {
          if (disposed || !running) return;
          raf = requestAnimationFrame(loop);
          const t = clock.getElapsedTime();
          const offset = (t * 2.2) % SPACING;
          cross.position.z = offset;
          points.rotation.y = Math.sin(t * 0.05) * 0.04;
          points.position.y = Math.sin(t * 0.3) * 0.15;
          camera.position.x += (target.x - camera.position.x) * 0.04;
          camera.position.y += (1.6 + target.y - camera.position.y) * 0.04;
          camera.lookAt(0, 0.2, -10);
          renderer.render(scene, camera);
        };
        loop();

        teardown = () => {
          ro.disconnect();
          window.removeEventListener('pointermove', onPointer);
          document.removeEventListener('visibilitychange', onVisibility);
          rails.geometry.dispose();
          crossGeo.dispose();
          pGeo.dispose();
          orange.dispose();
          dim.dispose();
          pMat.dispose();
          renderer.dispose();
        };
      })
      .catch(() => {
        /* three no disponible: el fondo CSS sigue visible */
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      teardown?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
    />
  );
}
