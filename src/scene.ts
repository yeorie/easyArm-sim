import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { axes, offsetAxis, radius, unit, type Axis, type Robot, type solve } from './kinematics.ts';
import { loadUr5eVisual, ur5eVisual } from './ur5e-visual.ts';
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

export type PointerMode = 'orbit' | 'locked' | 'jog';

export function createScene(host: HTMLElement, selectTarget: (x: number, y: number) => void,
  startJog: (index: number) => void, jogBy: (index: number, degrees: number) => void) {
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
  const riser = new T.Mesh(linkBody, body);
  const box = new T.BoxGeometry(1, 1, 1);
  const dummy = new T.Group();
  const dummyPlate = new T.Group();
  const yellow = new T.MeshBasicMaterial({ color: 0xffc646 });
  const black = new T.MeshBasicMaterial({ color: 0x101820 });
  function boxPart(width: number, height: number, thickness: number, x: number, y: number, z: number,
    surface: T.Material) {
    const result = new T.Mesh(box, surface);
    result.scale.set(width, height, thickness);
    result.position.set(x, y, z);
    return result;
  }
  dummyPlate.add(
    boxPart(66, 11, 10, 0, 0, 5, yellow),
    boxPart(11, 11, 50, -27, 0, 30, yellow),
    boxPart(11, 11, 50, 27, 0, 30, yellow),
    boxPart(12, 12, 11, 27, 0, 49, black),
  );
  dummy.add(dummyPlate);
  const mountingBlock = boxPart(158, 158, -floorZ, 0, 0, floorZ / 2, trim);
  scene.add(tool, dummy, riser, mountingBlock);
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
  const official = new T.Group();
  const officialParts = ur5eVisual.map(() => new T.Group());
  official.add(...officialParts);
  scene.add(chain, official);
  let wantsOfficial = false;
  let officialLoad: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  function showAppearance() {
    const ready = wantsOfficial && officialLoad === 'ready';
    official.visible = ready;
    platform.visible = !ready;
    mountingBlock.visible = ready;
    for (const visual of visuals) visual.shell.visible = !ready;
    riser.visible = wantsOfficial && !ready;
    host.dataset.appearance = ready ? 'ur5e' : wantsOfficial ? officialLoad : 'custom';
    const notice = host.parentElement?.querySelector<HTMLElement>('#appearance-status');
    if (notice) {
      notice.hidden = !wantsOfficial || ready;
      notice.textContent = officialLoad === 'failed' ? '공식 외형을 열지 못했습니다. 단순 외형을 표시합니다.' : 'UR5e 외형 로딩 중';
    }
    draw();
  }
  const visuals: {
    body: T.Mesh; cap: T.Mesh; collar: T.Mesh; insert: T.Mesh; link: T.Mesh; neck: T.Mesh; frame: T.Group;
    fixedMark: T.Group; movingMark: T.Group; elbow: T.Mesh; bend: T.Mesh; shell: T.Group;
  }[] = [];
  const axisAlign = Object.fromEntries(axes.map(axis =>
    [axis, new T.Quaternion().setFromUnitVectors(up, unit[axis])])) as Record<Axis, T.Quaternion>;
  const markBacking = new T.MeshBasicMaterial({ color: 0xccd5dc });

  function witness(moving: boolean) {
    const mark = new T.Group();
    // At 0°, both stripes line up on the back (−Z of the marker's radial frame).
    for (const side of [-1, 1]) {
      if (moving) {
        mark.add(boxPart(.18, .035, .49, 0, side * .677, -.46, yellow));
        mark.add(boxPart(.12, .38, .05, 0, side * .30, -1, yellow));
      } else {
        mark.add(boxPart(.17, .06, .23, 0, side * .524, -.94, markBacking));
        mark.add(boxPart(.076, .08, .24, 0, side * .531, -.94, black));
      }
    }
    return mark;
  }

  function segment(mesh: T.Mesh, a: T.Vector3, b: T.Vector3, width: number) {
    const vector = b.clone().sub(a);
    const length = vector.length();
    mesh.visible = length > 0.001;
    mesh.position.copy(a).addScaledVector(vector, 0.5);
    if (mesh.visible) mesh.quaternion.setFromUnitVectors(up, vector.divideScalar(length));
    mesh.scale.set(width, length, width);
  }

  let extent = 1;
  let centerZ = 0;
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
    controls.target.set(0, 0, centerZ + extent * 0.035);
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

  function rebuild(model: Robot, useOfficial: boolean) {
    while (visuals.length < model.joints.length) {
      const visual = {
        body: new T.Mesh(cylinder, gray),
        cap: new T.Mesh(cylinder, trim),
        collar: new T.Mesh(cylinder, body),
        insert: new T.Mesh(cylinder, gray),
        link: new T.Mesh(linkBody, body),
        neck: new T.Mesh(cylinder, gray),
        frame: axisFrame(71),
        fixedMark: witness(false),
        movingMark: witness(true),
        elbow: new T.Mesh(cylinder, trim),
        bend: new T.Mesh(new T.SphereGeometry(1, 16, 12), body),
        shell: new T.Group(),
      };
      visual.shell.add(visual.body, visual.cap, visual.collar, visual.insert,
        visual.link, visual.neck, visual.elbow, visual.bend);
      visuals.push(visual);
      chain.add(visual.shell, visual.frame, visual.fixedMark, visual.movingMark);
    }
    while (visuals.length > model.joints.length) {
      const removed = visuals.pop()!;
      chain.remove(removed.shell, removed.frame, removed.fixedMark, removed.movingMark);
      removed.bend.geometry.dispose();
      removed.frame.traverse(object => {
        if (object instanceof T.ArrowHelper) object.dispose();
      });
    }
    extent = Math.max(85, radius(model));
    shell.position.set(...(model.origin ?? [0, 0, 0]));
    centerZ = shell.position.z;
    shell.scale.setScalar(radius(model));
    segment(riser, base.position, shell.position, 48);
    wantsOfficial = useOfficial;
    if (wantsOfficial && officialLoad !== 'loading' && officialLoad !== 'ready') {
      officialLoad = 'loading';
      loadUr5eVisual().then(parts => {
        for (const [i, part] of parts.entries()) {
          part.traverse(object => { if (object instanceof T.Mesh) object.userData.joint = Math.max(0, i - 1); });
          officialParts[i].add(part);
        }
        officialLoad = 'ready';
        showAppearance();
      }).catch(() => {
        officialLoad = 'failed';
        showAppearance();
      });
    }
    showAppearance();
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
    sphere: boolean; points: boolean; frames: boolean; slice: boolean; dummy: boolean; marks: boolean;
  }) {
    selectedJoint = selected;
    for (const [i, frame] of solved.frames.entries()) {
      const visual = visuals[i];
      const joint = model.joints[i];
      const width = [52, 44, 38, 29, 23, 17][i] ?? 17;
      const spindle = unit[joint.axis].clone().applyQuaternion(frame.orientation);
      officialParts[i + 1]?.position.copy(frame.origin);
      officialParts[i + 1]?.quaternion.copy(frame.orientation);
      const origin = frame.origin.clone();
      if (i === 0 && model.origin) origin.addScaledVector(spindle, -34);
      for (const mark of [visual.fixedMark, visual.movingMark]) {
        mark.position.copy(origin);
        mark.scale.setScalar(width);
        mark.visible = display.marks;
      }
      visual.fixedMark.quaternion.copy(frame.zero).multiply(axisAlign[joint.axis]);
      visual.movingMark.quaternion.copy(frame.orientation).multiply(axisAlign[joint.axis]);
      visual.body.material = i === selected ? active : gray;
      segment(visual.body, origin.clone().addScaledVector(spindle, -width * 0.48),
        origin.clone().addScaledVector(spindle, width * 0.48), width);
      segment(visual.cap, origin.clone().addScaledVector(spindle, -width * 0.58),
        origin.clone().addScaledVector(spindle, width * 0.58), width * 0.84);
      segment(visual.collar, origin.clone().addScaledVector(spindle, -width * 0.66),
        origin.clone().addScaledVector(spindle, width * 0.66), width * 0.70);
      segment(visual.insert, origin.clone().addScaledVector(spindle, -width * 0.71),
        origin.clone().addScaledVector(spindle, width * 0.71), width * 0.26);
      for (const handle of [visual.body, visual.cap, visual.collar, visual.insert]) handle.userData.joint = i;
      visual.body.userData.spindle = spindle;
      visual.body.userData.origin = frame.origin;
      const corner = frame.origin.clone();
      if (joint.offset && !joint.vector) {
        corner.addScaledVector(unit[offsetAxis(joint.direction)].clone().applyQuaternion(frame.orientation), joint.offset);
      }
      const linkLength = corner.distanceTo(frame.end);
      const trimFraction = Math.min(0.30, width / Math.max(linkLength, 1) * 0.75);
      segment(visual.elbow, frame.origin, corner, width * 0.59);
      visual.bend.visible = visual.elbow.visible && linkLength > 0.001;
      visual.bend.position.copy(corner);
      visual.bend.scale.setScalar(width * 0.64);
      segment(visual.neck, corner, frame.end, width * 0.36);
      segment(visual.link, corner.clone().lerp(frame.end, visual.bend.visible ? 0 : trimFraction),
        frame.end.clone().lerp(corner, trimFraction), width * 0.66);
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
    const flange = solved.frames[solved.frames.length - 1].end;
    const mount = flange.clone().addScaledVector(unit.Z.clone().applyQuaternion(solved.toolOrientation),
      Math.max(0, model.tool - 55));
    segment(tool, flange, display.dummy ? mount : solved.tcp, 12);
    tcp.position.copy(solved.tcp);
    dummy.position.copy(mount);
    dummy.quaternion.copy(solved.toolOrientation);
    dummy.visible = display.dummy;
    shell.visible = display.sphere && radius(model) > 0;
    points.visible = display.points;
    slice.visible = display.slice;
    draw();
  }

  controls.addEventListener('change', draw);
  const picker = new T.Raycaster();
  const plate = new T.Plane(unit.Z, -floorZ);
  let mode: PointerMode = 'orbit';
  let selectedJoint = 0;
  let gesture: { id: number; index: number; x: number; y: number; direction: T.Vector2 } | undefined;
  function setMode(value: PointerMode) {
    gesture = undefined;
    mode = value;
    host.dataset.mode = value;
    controls.enabled = mode === 'orbit';
  }

  function pointRay(event: MouseEvent) {
    const rect = renderer.domElement.getBoundingClientRect();
    const cursor = new T.Vector2((event.clientX - rect.left) / rect.width * 2 - 1,
      1 - (event.clientY - rect.top) / rect.height * 2);
    camera.updateMatrixWorld();
    picker.setFromCamera(cursor, camera);
    scene.updateMatrixWorld();
    return rect;
  }
  renderer.domElement.addEventListener('dblclick', event => {
    if (mode === 'jog') return;
    pointRay(event);
    const hit = picker.ray.intersectPlane(plate, new T.Vector3());
    if (hit && Math.abs(hit.x) <= gridExtent && Math.abs(hit.y) <= gridExtent) {
      selectTarget(snapToGrid(hit.x), snapToGrid(hit.y));
    }
  });

  renderer.domElement.addEventListener('pointerdown', event => {
    if (mode !== 'jog' || event.button !== 0 || gesture) return;
    const rect = pointRay(event);
    const joints = official.visible ? officialParts : visuals.flatMap(visual => [visual.body, visual.cap, visual.collar, visual.insert]);
    const handles = dummy.visible ? [...dummyPlate.children, tool, marker] : [tool, marker];
    const found = picker.intersectObjects([...joints, ...handles], official.visible).find(hit => hit.object.visible);
    if (!found) return;
    const index = found.object.userData.joint ?? selectedJoint;
    const { spindle, origin } = visuals[index].body.userData as { spindle: T.Vector3; origin: T.Vector3 };
    const tangent = spindle.clone().cross(found.point.clone().sub(origin)).normalize();
    const current = found.point.clone().project(camera);
    const next = found.point.clone().addScaledVector(tangent, 100).project(camera);
    const direction = new T.Vector2((next.x - current.x) * rect.width, (current.y - next.y) * rect.height);
    if (direction.length() < 5) direction.set(1, 0);
    else direction.normalize();
    gesture = { id: event.pointerId, index, x: event.clientX, y: event.clientY, direction };
    renderer.domElement.setPointerCapture(event.pointerId);
    startJog(index);
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (event.pointerId !== gesture?.id) return;
    const movement = (event.clientX - gesture.x) * gesture.direction.x + (event.clientY - gesture.y) * gesture.direction.y;
    gesture.x = event.clientX;
    gesture.y = event.clientY;
    jogBy(gesture.index, movement * 0.65);
  });
  renderer.domElement.addEventListener('lostpointercapture', () => { gesture = undefined; });
  new ResizeObserver(resize).observe(host);
  resize();

  return { rebuild, update, fit, setSamples, setTarget, setMode };
}
