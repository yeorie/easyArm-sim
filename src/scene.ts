import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { axes, radius, sample, unit, type Axis, type Robot, type solve } from './kinematics.ts';

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

export function createScene(host: HTMLElement) {
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
  const axisMaterials = { X: new T.MeshBasicMaterial({ color: colors.X }), Y: new T.MeshBasicMaterial({ color: colors.Y }), Z: new T.MeshBasicMaterial({ color: colors.Z }) };
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

  const grid = new T.GridHelper(2, 28, 0x394454, 0x26303c);
  grid.rotation.x = Math.PI / 2;
  grid.material.transparent = true;
  grid.material.opacity = 0.46;
  scene.add(grid);

  const shell = new T.LineSegments(lattice(), new T.LineBasicMaterial({
    color: 0x7189a3, transparent: true, opacity: 0.24, depthWrite: false,
  }));
  const points = new T.Points(new T.BufferGeometry(), new T.PointsMaterial({
    color: 0x7ed2ff, transparent: true, opacity: 0.46, size: 1.7, sizeAttenuation: false, depthWrite: false,
  }));
  scene.add(shell, points);

  function axisFrame(size: number) {
    const frame = new T.Group();
    for (const axis of axes) {
      const vector = unit[axis];
      const arrow = new T.ArrowHelper(vector, new T.Vector3(), size, colors[axis], size * 0.19, size * 0.09);
      const label = new T.Sprite(axisLabels[axis]);
      label.position.copy(vector).multiplyScalar(size + 12);
      label.scale.set(43, 21.5, 1);
      label.renderOrder = 3;
      frame.add(arrow, label);
    }
    return frame;
  }

  const base = axisFrame(112);
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
  scene.add(highlight);
  const selectedTag = new T.Sprite();
  selectedTag.scale.set(64, 32, 1);
  selectedTag.renderOrder = 4;
  scene.add(selectedTag);
  const jointLabels = new Map<number, T.SpriteMaterial>();
  const chain = new T.Group();
  scene.add(chain);
  const visuals: {
    body: T.Mesh; cap: T.Mesh; collar: T.Mesh; insert: T.Mesh; link: T.Mesh; frame: T.Group;
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

  function fit() {
    // Fit the bound in both dimensions. Keep the optical center slightly above the base.
    const vertical = T.MathUtils.degToRad(camera.fov / 2);
    const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
    const distance = Math.max(210, extent * 1.24 / Math.sin(halfAngle));
    controls.target.set(0, 0, extent * 0.035);
    camera.position.copy(controls.target).addScaledVector(new T.Vector3(0.66, -1, 0.48).normalize(), distance);
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
        frame: axisFrame(49),
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
    grid.scale.setScalar(extent * 1.72);
    grid.position.z = -62;
    points.geometry.dispose();
    points.geometry = new T.BufferGeometry();
    points.geometry.setAttribute('position', new T.Float32BufferAttribute(sample(model), 3));
    draw();
  }

  function update(model: Robot, solved: ReturnType<typeof solve>, selected: number, display: {
    sphere: boolean; points: boolean; frames: boolean;
  }) {
    for (const [i, frame] of solved.frames.entries()) {
      const visual = visuals[i];
      const joint = model.joints[i];
      const width = i === 0 ? 51 : i === 1 ? 45 : i === 2 ? 38 : i === 3 ? 30 : 24;
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
      segment(visual.link, frame.origin, frame.end, width * 0.76);
      visual.frame.position.copy(frame.origin);
      visual.frame.quaternion.copy(frame.orientation);
      visual.frame.visible = display.frames;
      if (i === selected) {
        highlight.material = axisMaterials[joint.axis];
        segment(highlight, frame.origin.clone().addScaledVector(spindle, -width - 16),
          frame.origin.clone().addScaledVector(spindle, width + 16), 2.8);
        if (!jointLabels.has(i)) jointLabels.set(i, labelTexture('J' + (i + 1), 0xd6eaff));
        selectedTag.material = jointLabels.get(i)!;
        selectedTag.position.copy(frame.origin).addScaledVector(spindle, width + 30);
      }
    }
    segment(tool, solved.frames[solved.frames.length - 1].end, solved.tcp, 12);
    tcp.position.copy(solved.tcp);
    shell.visible = display.sphere && radius(model) > 0;
    points.visible = display.points;
    draw();
  }

  controls.addEventListener('change', draw);
  new ResizeObserver(resize).observe(host);
  resize();

  return { rebuild, update, fit };
}
