import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { axes, radius, unit, type Axis, type Robot, type solve } from './kinematics.ts';
import { floorZ, gridExtent, gridSpacing, snapToGrid } from './workspace.ts';

const colors = { X: 0xf47778, Y: 0x62cf9b, Z: 0x78aaff };
const up = unit.Y;
const material = (color: number, metalness = 0) =>
  new T.MeshStandardMaterial({ color, roughness: 0.76, metalness });

function labelTexture(text: string, color: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.font = 'bold 34px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.strokeStyle = '#0d1116';
  context.lineWidth = 8;
  context.strokeText(text, 64, 34);
  context.fillStyle = '#' + color.toString(16).padStart(6, '0');
  context.fillText(text, 64, 34);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return new T.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
}

function lattice() {
  const vertices: number[] = [];
  const segments = 96;
  function circle(phi: (t: number) => number, theta: (t: number) => number) {
    function point(t: number) {
      const p = phi(t), a = theta(t);
      vertices.push(Math.sin(p) * Math.cos(a), Math.sin(p) * Math.sin(a), Math.cos(p));
    }
    for (let step = 0; step < segments; step++) {
      point(step / segments);
      point((step + 1) / segments);
    }
  }
  for (let i = 1; i < 12; i++) circle(() => i * Math.PI / 12, t => t * Math.PI * 2);
  for (let i = 0; i < 12; i++) circle(t => t * Math.PI * 2, () => i * Math.PI / 12);
  return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
}

function tableGrid() {
  const light: number[] = [];
  const dark: number[] = [];
  for (let position = -gridExtent; position <= gridExtent; position += gridSpacing) {
    const lines = position % 100 === 0 ? light : dark;
    lines.push(-gridExtent, position, floorZ, gridExtent, position, floorZ);
    lines.push(position, -gridExtent, floorZ, position, gridExtent, floorZ);
  }
  function lines(positions: number[], color: number, opacity: number) {
    const geometry = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    return new T.LineSegments(geometry, new T.LineBasicMaterial({ color, transparent: true, opacity }));
  }
  const grid = new T.Group();
  grid.add(lines(light, 0x66798e, 0.65), lines(dark, 0x4b6077, 0.39));
  grid.add(
    lines([-gridExtent, 0, floorZ, gridExtent, 0, floorZ], colors.X, 0.57),
    lines([0, -gridExtent, floorZ, 0, gridExtent, floorZ], colors.Y, 0.57),
  );
  for (const value of [-750, -500, -250, 250, 500, 750]) {
    const x = new T.Sprite(labelTexture(String(value), colors.X));
    const y = new T.Sprite(labelTexture(String(value), colors.Y));
    x.position.set(value, -27, floorZ + 4);
    y.position.set(-27, value, floorZ + 4);
    x.scale.set(64, 32, 1);
    y.scale.copy(x.scale);
    // Keep table labels behind arm geometry.
    x.material.depthTest = y.material.depthTest = true;
    grid.add(x, y);
  }
  return grid;
}

export function createScene(host: HTMLElement, selectTarget: (x: number, y: number) => void) {
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x0c1016);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  renderer.domElement.setAttribute('aria-label', '3D 로봇팔과 작업공간');
  host.append(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(42, 1, 1, 2000000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 5;
  controls.maxDistance = 1500000;
  controls.zoomSpeed = 0.85;

  const ambient = new T.HemisphereLight(0xf4f8ff, 0x566378, 2.35);
  const key = new T.DirectionalLight(0xfff7e7, 2.8);
  key.position.set(0.65, -1, 1.2);
  const fill = new T.DirectionalLight(0xc3dbff, 1.6);
  fill.position.set(-1, 0.75, 0.6);
  scene.add(ambient, key, fill);

  const body = material(0xf0f0ef);
  const trim = material(0x242e3a, 0.12);
  const gray = material(0x747f8c, 0.16);
  const active = material(0xd8e7f4);
  const toolMaterial = material(0xcfd9e3);
  const cylinder = new T.CylinderGeometry(1, 1, 1, 32);
  const linkBody = new T.CylinderGeometry(0.82, 1, 1, 12);
  const axisMaterials = {
    X: new T.MeshBasicMaterial({ color: colors.X, depthTest: false }),
    Y: new T.MeshBasicMaterial({ color: colors.Y, depthTest: false }),
    Z: new T.MeshBasicMaterial({ color: colors.Z, depthTest: false }),
  };
  const axisLabels = Object.fromEntries(axes.map(a => [a, labelTexture(a, colors[a])])) as Record<Axis, T.SpriteMaterial>;

  function disc(radiusMm: number, height: number, z: number, surface: T.Material) {
    const discMesh = new T.Mesh(cylinder, surface);
    discMesh.scale.set(radiusMm, height, radiusMm);
    discMesh.position.z = z;
    discMesh.quaternion.setFromUnitVectors(up, unit.Z);
    return discMesh;
  }

  const platform = new T.Group();
  platform.add(disc(91, 15, -53, trim), disc(84, 24, -36, body), disc(63, 17, -16, gray), disc(59, 5, -6, trim));
  scene.add(platform);

  scene.add(tableGrid());

  const shell = new T.LineSegments(lattice(), new T.LineBasicMaterial({
    color: 0x7189a3, transparent: true, opacity: 0.24, depthWrite: false,
  }));
  const points = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({
    color: 0x7ed2ff, transparent: true, opacity: 0.46, size: 1.7, sizeAttenuation: false, depthWrite: false,
  }));
  const slice = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({
    color: 0x85cfff, transparent: true, opacity: 0.8, size: 3, sizeAttenuation: false, depthWrite: false,
  }));
  scene.add(shell, points, slice);

  const target = new T.Group();
  const targetMaterial = new T.MeshBasicMaterial({ color: 0xf3c070 });
  const targetDot = new T.Mesh(new T.SphereGeometry(8, 18, 12), targetMaterial);
  const targetRing = new T.Mesh(new T.RingGeometry(10, 14, 32), new T.MeshBasicMaterial({
    color: 0xf3c070, side: T.DoubleSide,
  }));
  const targetStem = new T.Mesh(cylinder, targetMaterial);
  const targetLabel = new T.Sprite(labelTexture('목표', 0xf3c070));
  targetLabel.scale.set(72, 36, 1);
  target.add(targetDot, targetRing, targetStem, targetLabel);
  scene.add(target);

  function axisFrame(size: number) {
    const frame = new T.Group();
    for (const axis of axes) {
      const vector = unit[axis];
      const arrow = new T.ArrowHelper(vector, new T.Vector3(), size, colors[axis], size * 0.24, size * 0.13);
      const label = new T.Sprite(axisLabels[axis]);
      label.position.copy(vector).multiplyScalar(size + 12);
      label.scale.set(43, 21.5, 1);
      label.renderOrder = 3;
      frame.add(arrow, label);
    }
    return frame;
  }

  const base = axisFrame(137);
  const baseLabel = new T.Sprite(labelTexture('BASE', 0x9daebf));
  baseLabel.position.set(-65, -28, 14);
  baseLabel.scale.set(62, 31, 1);
  base.add(baseLabel);
  scene.add(base);

  const tcp = new T.Group();
  const marker = new T.Mesh(new T.SphereGeometry(8, 20, 12), new T.MeshBasicMaterial({
    color: 0x91deff, depthTest: false,
  }));
  marker.renderOrder = 4;
  const tcpLabel = new T.Sprite(labelTexture('TCP', 0xa4e5ff));
  tcpLabel.position.z = 25;
  tcpLabel.scale.set(74, 37, 1);
  tcpLabel.renderOrder = 4;
  tcp.add(marker, tcpLabel);
  scene.add(tcp);

  const tool = new T.Mesh(cylinder, toolMaterial);
  scene.add(tool);
  const highlight = new T.Mesh(cylinder, axisMaterials.Z);
  const highlightHead = new T.Mesh(new T.ConeGeometry(9, 22, 20), axisMaterials.Z);
  highlight.renderOrder = highlightHead.renderOrder = 3;
  scene.add(highlight, highlightHead);
  const selectedTag = new T.Sprite();
  selectedTag.scale.set(64, 32, 1);
  selectedTag.renderOrder = 4;
  scene.add(selectedTag);
  const jointLabels = new Map<string, T.SpriteMaterial>();
  const chain = new T.Group();
  scene.add(chain);
  const visuals: {
    body: T.Mesh; cap: T.Mesh; collar: T.Mesh; insert: T.Mesh; link: T.Mesh; neck: T.Mesh; frame: T.Group;
  }[] = [];

  function segment(mesh: T.Mesh, a: T.Vector3, b: T.Vector3, width: number) {
    const vector = b.clone().sub(a);
    const length = vector.length();
    mesh.visible = length > 0.001;
    mesh.position.copy(a).addScaledVector(vector, 0.5);
    if (mesh.visible) mesh.quaternion.setFromUnitVectors(up, vector.divideScalar(length));
    mesh.scale.set(width, length, width);
  }

  let extent = 1;
  let renderPending = false;
  function draw() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      renderer.render(scene, camera);
    });
  }

  function fit(top = false) {
    // Fit the bound in both dimensions. Keep the optical center slightly above the base.
    const vertical = T.MathUtils.degToRad(camera.fov / 2);
    const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
    const distance = Math.max(210, extent * (top ? 1.1 : 1.28) / Math.sin(halfAngle));
    controls.target.set(0, 0, extent * 0.035);
    const direction = top ? new T.Vector3(0, -0.0001, 1) : new T.Vector3(0.78, -1, 0.67);
    camera.position.copy(controls.target).addScaledVector(direction.normalize(), distance);
    controls.update();
    draw();
  }

  function resize() {
    const { clientWidth: width, clientHeight: height } = host;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    draw();
  }

  function rebuild(model: Robot) {
    while (visuals.length < model.joints.length) {
      const visual = {
        body: new T.Mesh(cylinder, gray),
        cap: new T.Mesh(cylinder, trim),
        collar: new T.Mesh(cylinder, body),
        insert: new T.Mesh(cylinder, gray),
        link: new T.Mesh(linkBody, body),
        neck: new T.Mesh(cylinder, gray),
        frame: axisFrame(71),
      };
      visuals.push(visual);
      chain.add(...Object.values(visual));
    }
    while (visuals.length > model.joints.length) {
      const removed = visuals.pop()!;
      chain.remove(...Object.values(removed));
      removed.frame.traverse(object => {
        if (object instanceof T.ArrowHelper) object.dispose();
      });
    }
    extent = Math.max(85, radius(model));
    shell.scale.setScalar(radius(model));
    draw();
  }

  function setSamples(samples: Float64Array) {
    points.geometry.dispose();
    points.geometry = new T.BufferGeometry();
    points.geometry.setAttribute('position', new T.Float32BufferAttribute(samples, 3));
    draw();
  }

  function setTarget([x, y, z]: [number, number, number], samplesAtHeight: Float32Array) {
    targetDot.position.set(x, y, z);
    targetRing.position.set(x, y, floorZ + 0.6);
    segment(targetStem, targetRing.position, targetDot.position, 1.5);
    targetLabel.position.set(x, y, z + 25);
    slice.geometry.dispose();
    slice.geometry = new T.BufferGeometry();
    slice.geometry.setAttribute('position', new T.BufferAttribute(samplesAtHeight, 3));
    draw();
  }

  function update(model: Robot, solved: ReturnType<typeof solve>, selected: number, display: {
    sphere: boolean; points: boolean; frames: boolean; slice: boolean;
  }) {
    for (const [i, frame] of solved.frames.entries()) {
      const visual = visuals[i];
      const joint = model.joints[i];
      const width = [52, 44, 38, 29, 23, 17][i] ?? 17;
      const spindle = unit[joint.axis].clone().applyQuaternion(frame.orientation);
      visual.body.material = i === selected ? active : gray;
      segment(visual.body, frame.origin.clone().addScaledVector(spindle, -width * 0.48),
        frame.origin.clone().addScaledVector(spindle, width * 0.48), width);
      segment(visual.cap, frame.origin.clone().addScaledVector(spindle, -width * 0.58),
        frame.origin.clone().addScaledVector(spindle, width * 0.58), width * 0.84);
      segment(visual.collar, frame.origin.clone().addScaledVector(spindle, -width * 0.66),
        frame.origin.clone().addScaledVector(spindle, width * 0.66), width * 0.70);
      segment(visual.insert, frame.origin.clone().addScaledVector(spindle, -width * 0.71),
        frame.origin.clone().addScaledVector(spindle, width * 0.71), width * 0.26);
      const linkLength = frame.origin.distanceTo(frame.end);
      const trimFraction = Math.min(0.30, width / Math.max(linkLength, 1) * 0.75);
      segment(visual.neck, frame.origin, frame.end, width * 0.36);
      segment(visual.link, frame.origin.clone().lerp(frame.end, trimFraction),
        frame.end.clone().lerp(frame.origin, trimFraction), width * 0.66);
      visual.frame.position.copy(frame.origin);
      visual.frame.quaternion.copy(frame.orientation);
      visual.frame.visible = display.frames;
      if (i === selected) {
        highlight.material = axisMaterials[joint.axis];
        highlightHead.material = highlight.material;
        segment(highlight, frame.origin.clone().addScaledVector(spindle, -width * 0.7),
          frame.origin.clone().addScaledVector(spindle, width + 45), 3.8);
        highlightHead.position.copy(frame.origin).addScaledVector(spindle, width + 52);
        highlightHead.quaternion.setFromUnitVectors(up, spindle);
        const tag = 'J' + (i + 1) + ' ' + joint.axis;
        if (!jointLabels.has(tag)) jointLabels.set(tag, labelTexture(tag, colors[joint.axis]));
        selectedTag.material = jointLabels.get(tag)!;
        selectedTag.position.copy(frame.origin).addScaledVector(spindle, width + 83);
      }
    }
    segment(tool, solved.frames[solved.frames.length - 1].end, solved.tcp, 12);
    tcp.position.copy(solved.tcp);
    shell.visible = display.sphere && radius(model) > 0;
    points.visible = display.points;
    slice.visible = display.slice;
    draw();
  }

  controls.addEventListener('change', draw);
  const picker = new T.Raycaster();
  const plate = new T.Plane(unit.Z, -floorZ);
  renderer.domElement.addEventListener('dblclick', event => {
    const rect = renderer.domElement.getBoundingClientRect();
    const cursor = new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    picker.setFromCamera(cursor, camera);
    const hit = picker.ray.intersectPlane(plate, new T.Vector3());
    if (hit && Math.abs(hit.x) <= gridExtent && Math.abs(hit.y) <= gridExtent) {
      selectTarget(snapToGrid(hit.x), snapToGrid(hit.y));
    }
  });
  new ResizeObserver(resize).observe(host);
  resize();

  return { rebuild, update, fit, setSamples, setTarget };
}
