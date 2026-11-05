"use client";
/* Vista aparte con los tiles fotorrealistas de Google. Solo existe si hay clave cargada y no se mezcla
   con la ciudad de FAMA: Google no permite combinar sus tiles con otros mapas ni usarlos sin conexión. */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const CLAVE = process.env.NEXT_PUBLIC_GOOGLE_3D_KEY || "";
export const hayGoogle3D = () => !!CLAVE;

/* CAMERA_FRAME de la librería: existe en el código, pero sus tipos no lo exportan */
const MARCO_CAMARA = 1 as never;

type Props = { lat: number; lon: number };

export default function Google3D({ lat, lon }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const [fuentes, setFuentes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!CLAVE) return;
    let vivo = true, cuadro = 0;
    let soltar = () => {};

    (async () => {
      const THREE = await import("three");
      const { TilesRenderer, GlobeControls, WGS84_ELLIPSOID } = await import("3d-tiles-renderer");
      const { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, TilesFadePlugin } = await import("3d-tiles-renderer/plugins");
      const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
      const el = caja.current;
      if (!vivo || !el) return;

      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0xbcd6ee);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 1, 1, 16000000);
      const draco = new DRACOLoader().setDecoderPath("/draco/").setDecoderConfig({ type: "wasm" });

      const tiles = new TilesRenderer();
      tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: CLAVE, autoRefreshToken: true }));
      tiles.registerPlugin(new TileCompressionPlugin());
      tiles.registerPlugin(new TilesFadePlugin());
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
      tiles.group.rotation.x = -Math.PI / 2;
      tiles.group.updateMatrixWorld(true);
      scene.add(tiles.group);
      tiles.setCamera(camera);

      const controles = new GlobeControls(scene, camera, renderer.domElement);
      controles.setEllipsoid(tiles.ellipsoid, tiles.group);
      controles.enableDamping = true;

      const medir = () => {
        const a = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(a, h);
        camera.aspect = a / h;
        camera.updateProjectionMatrix();
        tiles.setResolutionFromRenderer(camera, renderer);
      };
      const observador = new ResizeObserver(medir);
      observador.observe(el);
      medir();

      const r = THREE.MathUtils.DEG2RAD;
      WGS84_ELLIPSOID.getObjectFrame(lat * r, lon * r, 320, 0, -40 * r, 0, camera.matrixWorld, MARCO_CAMARA);
      camera.matrixWorld.premultiply(tiles.group.matrixWorld);
      camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);

      const fallo = () => { if (vivo) setError("Google no respondió. Revisá la clave o tu conexión."); };
      tiles.addEventListener("load-error", fallo);

      let ultima = "", tiempo = 0;
      const dibujar = (t: number) => {
        cuadro = requestAnimationFrame(dibujar);
        if (document.hidden) return;
        controles.update();
        camera.updateMatrixWorld();
        tiles.update();
        renderer.render(scene, camera);
        if (t - tiempo > 1000) {
          tiempo = t;
          const texto = tiles.getAttributions().filter((a) => a.type === "string").map((a) => String(a.value)).join(" ");
          if (texto !== ultima) { ultima = texto; setFuentes(texto); }
        }
      };
      cuadro = requestAnimationFrame(dibujar);

      soltar = () => {
        cancelAnimationFrame(cuadro);
        observador.disconnect();
        tiles.removeEventListener("load-error", fallo);
        controles.dispose();
        tiles.dispose();
        draco.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
      if (!vivo) soltar();
    })().catch(() => { if (vivo) setError("No se pudo abrir esta vista en este dispositivo."); });

    return () => { vivo = false; soltar(); };
  }, [lat, lon]);

  const volver = `/calle?lat=${lat}&lon=${lon}`;
  if (!CLAVE) {
    return (
      <div className="g3d g3d-vacio">
        <p>Esta vista todavía no está disponible.</p>
        <Link href={volver}>Volver a la ciudad</Link>
      </div>
    );
  }
  return (
    <div className="g3d">
      <div ref={caja} className="g3d-lienzo" />
      <Link className="g3d-volver" href={volver}>Volver a la ciudad</Link>
      {error && <p className="g3d-error" role="alert">{error}</p>}
      <p className="g3d-credito"><strong>Google Maps</strong>{fuentes ? ` · ${fuentes}` : ""}</p>
    </div>
  );
}
