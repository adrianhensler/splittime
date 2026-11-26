import {
  ACESFilmicToneMapping, Box3, DirectionalLight, GLTFLoader, HemisphereLight, Matrix4,
  PerspectiveCamera, PMREMGenerator, RoomEnvironment, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from "./vendor/chase-three.min.js";

const C = globalThis.ChaseModel;
const modelURL = new URL("../media/every-run/every-run-gt.glb", import.meta.url);
// The replay camera looks along +Z at zero yaw. glTF uses -Z for this car's nose.
const toGL = ([x, y, z]) => new Vector3(x, y, -z);

function reflections(renderer) {
  const room = new RoomEnvironment(), generator = new PMREMGenerator(renderer);
  try { return generator.fromScene(room, 0.03); }
  finally { room.dispose(); generator.dispose(); }
}

// Project the car's bounding box so a small car only needs a small WebGL surface.
// If the box crosses the near plane, let the GPU clip the full camera view.
function screenRect(eye, corners, origin, {r, u, f}) {
  let left = eye.w, top = eye.h, right = 0, bottom = 0;
  for (const [x, y, z] of corners) {
    const point = C.add(origin, C.add(C.mul(r, x), C.add(C.mul(u, y), C.mul(f, -z))));
    const at = C.project(eye, point);
    if (!at) return {x: 0, y: 0, w: eye.w, h: eye.h};
    left = Math.min(left, at[0]); right = Math.max(right, at[0]);
    top = Math.min(top, at[1]); bottom = Math.max(bottom, at[1]);
  }
  const x = Math.max(0, Math.floor(left) - 2), y = Math.max(0, Math.floor(top) - 2);
  return {x, y, w: Math.min(eye.w, Math.ceil(right) + 2) - x,
    h: Math.min(eye.h, Math.ceil(bottom) + 2) - y};
}

export async function createGT(redraw) {
  const surface = document.createElement("canvas");
  const gl = surface.getContext("webgl2", {alpha: true, antialias: true});
  if (!gl) return null;
  const renderer = new WebGLRenderer({canvas: surface, context: gl});
  try {
    const {scene: car} = await new GLTFLoader().loadAsync(modelURL.href);
    const scene = new Scene(), camera = new PerspectiveCamera();
    const sun = new DirectionalLight(0xfff0dc, 1.65);
    sun.position.set(1, 3, 2);
    scene.add(car, sun, new HemisphereLight(0xdceaff, 0x45515e, 0.5));
    renderer.setClearColor(0, 0);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    scene.environmentIntensity = 0.63;
    let environment;
    // GPU render targets lose their contents on context loss. Rebuild the
    // lighting on the first restored draw, including when paused on one frame.
    surface.addEventListener("webglcontextlost", () => {
      environment?.dispose();
      environment = null;
      scene.environment = null;
      redraw();
    });
    surface.addEventListener("webglcontextrestored", redraw);

    const bounds = new Box3().setFromObject(car), corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) corners.push([x, y, z]);
    }
    const wheels = [];
    let paint, tail, lastColour;
    car.traverse(part => {
      if (part.isGroup && part.name.startsWith("Wheel")) wheels.push(part);
      if (part.material?.name.includes("layered lacquer")) paint = part.material;
      if (part.material?.name.includes("rear optical")) tail = part.material;
    });
    if (!paint || !tail || wheels.length !== 4) throw new Error("Incomplete Every Run GT asset");
    const axes = new Matrix4();

    function draw(ctx, eye, p, way, colour, brake, distance) {
      if (gl.isContextLost()) return false;
      if (!environment) {
        environment = reflections(renderer);
        scene.environment = environment.texture;
      }
      const basis = way.f ? way : C.level(way);
      const origin = C.sub(p, C.mul(basis.u, C.RIDE + bounds.min.y));
      car.position.copy(toGL(origin));
      car.quaternion.setFromRotationMatrix(axes.makeBasis(toGL(basis.r), toGL(basis.u), toGL(basis.f).negate()));
      for (const wheel of wheels) wheel.rotation.x = -distance / 0.355;
      if (colour !== lastColour) {
        const {h, s, l} = paint.color.set(colour).getHSL({}, SRGBColorSpace);
        paint.color.setHSL(h, Math.min(1, s + 0.18), l * 0.73, SRGBColorSpace);
        lastColour = colour;
      }
      tail.emissiveIntensity = brake > 5 ? 1.7 + 2.5 * Math.min(1, brake / 100) : 0.13;

      const rect = screenRect(eye, corners, origin, basis);
      if (rect.w <= 0 || rect.h <= 0) return true;
      // Cap the offscreen buffer on large/high-DPI displays. Grow in tiles to
      // avoid reallocating the drawing buffer every time the car moves a pixel.
      const scale = Math.min(ctx.canvas.width / eye.w, 2, 1024 / Math.max(rect.w, rect.h));
      const w = Math.max(1, Math.round(rect.w * scale)), h = Math.max(1, Math.round(rect.h * scale));
      if (w > surface.width || h > surface.height) {
        renderer.setSize(Math.max(surface.width, Math.ceil(w / 64) * 64),
          Math.max(surface.height, Math.ceil(h / 64) * 64), false);
      }
      camera.position.copy(toGL(eye.eye)); camera.up.copy(toGL(eye.u));
      camera.lookAt(toGL(C.add(eye.eye, eye.f)));
      camera.fov = 2 * Math.atan(eye.h / (2 * eye.focal)) * 180 / Math.PI;
      camera.near = 0.3;
      camera.setViewOffset(eye.w, eye.h, rect.x, rect.y, rect.w, rect.h);
      renderer.setViewport(0, 0, w, h);
      renderer.setScissor(0, 0, w, h);
      renderer.setScissorTest(true);
      renderer.render(scene, camera);
      ctx.drawImage(surface, 0, surface.height - h, w, h, rect.x, rect.y, rect.w, rect.h);
      return true;
    }
    // A driver can fail during shader or render-target setup, after loading the
    // module successfully. Keep the ordinary Chase draw path usable in that case.
    let failed = false;
    return (...args) => {
      if (failed) return false;
      try { return draw(...args); }
      catch (error) {
        failed = true;
        renderer.dispose();
        renderer.forceContextLoss();
        console.warn("Chase is using the simple car.", error);
        return false;
      }
    };
  } catch (error) {
    renderer.dispose();
    renderer.forceContextLoss();
    throw error;
  }
}
