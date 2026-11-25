import './style.css';
import { axes, clampAngle, interpolate, offsetAxis, poseProblem, radius, sample, solve, zeroBlockedAxes, type Axis } from './kinematics.ts';
import { createScene, type PointerMode } from './scene.ts';
import { isVendor, maxAngle, maxJoints, maxLength, readState, storageKey, switchPreset, type Preset } from './storage.ts';
import { nearestDistance, slicePoints, sliceTolerance, targetPosition } from './workspace.ts';
import { jointLimitStatus, mobility, mobilityReference, type MobilityReference } from './mobility.ts';
import { makeUr5e, ur5eUprightAngles, type Ur5eRange } from './ur5e.ts';
import { pathContact, tableContact } from './ur5e-clearance.ts';
import { vendorIds, vendorModels } from './vendor-models.ts';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const state = readState();
const list = element('joint-list');
const editor = element('joint-editor');
const jog = element('jog');
const poses = element<HTMLSelectElement>('pose-select');
const move = element<HTMLButtonElement>('move');
const removePose = element<HTMLButtonElement>('delete-pose');
const add = element<HTMLButtonElement>('add-joint');
const tool = element<HTMLInputElement>('tool-length');
const fit = element<HTMLButtonElement>('fit');
const topView = element<HTMLButtonElement>('top-view');
const pointerMode = element<HTMLSelectElement>('pointer-mode');
const zeroButton = element<HTMLButtonElement>('zero');
const zeroStatus = element('zero-status');
const tableStatus = element('table-status');
const urRange = element<HTMLSelectElement>('ur-range-profile');
const urRangeStatus = element('ur-range-status');
const mobilitySummary = element<HTMLOutputElement>('mobility-summary');
const mobilityPosition = element('mobility-position');
const mobilityPose = element('mobility-pose');
const limitsSummary = element('limits-summary');
const angleInputStatus = element('angle-input-status');
const status = element('status');
const sceneHost = element('scene');
const coordinates = ['tcp-x', 'tcp-y', 'tcp-z'].map(id => element<HTMLOutputElement>(id));
const jogFields: { range: HTMLInputElement; angle: HTMLInputElement }[] = [];

let activeJoint = 0;
let scene: ReturnType<typeof createScene> | undefined;
let moveFrame = 0;
let referenceMove = '';
let reference: MobilityReference = { position: 0, pose: 0 };
let workspaceSamples: Float64Array = new Float64Array(0);
try {
  scene = createScene(sceneHost, (x, y) => {
    state.target.x = x;
    state.target.y = y;
    element<HTMLInputElement>('target-x').value = String(x);
    element<HTMLInputElement>('target-y').value = String(y);
    refreshTarget();
    updatePose();
    persist();
  }, index => {
    stopMove(true);
    setActive(index);
  }, (index, delta) => {
    const next = Number((state.angles[index] + delta).toFixed(4));
    setJointAngle(index, next);
  });
} catch {
  const error = document.createElement('p');
  error.className = 'scene-error';
  error.textContent = '3D 뷰를 열 수 없습니다. WebGL2를 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.';
  sceneHost.append(error);
  fit.disabled = true;
  topView.disabled = true;
  pointerMode.disabled = true;
}

function setJointAngle(index: number, requested: number, angleInput?: HTMLInputElement) {
  const next = [...state.angles];
  next[index] = clampAngle(Number(requested.toFixed(4)), state.model.joints[index]);
  const contact = state.preset === 'ur5e' ? pathContact(state.model, state.angles, next) : 0;
  if (contact) {
    tableStatus.textContent = `정반 간섭으로 이동을 막았습니다 · J${contact} 링크`;
    updatePose();
    return;
  }
  tableStatus.textContent = '';
  state.angles = next;
  updatePose(angleInput);
  persist();
}

function persist() {
  const notice = element('storage-status');
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    notice.hidden = true;
  } catch {
    notice.hidden = false;
    notice.textContent = '브라우저 저장 공간을 사용할 수 없습니다.';
  }
}

function setStatus(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}

function selectedPose() {
  return state.poses.find(pose => pose.id === poses.value);
}

function poseButtons(clearStatus: boolean) {
  const pose = selectedPose();
  removePose.disabled = !pose;
  const problem = pose ? poseProblem(state.model, pose) : '';
  move.disabled = !pose || Boolean(problem) || Boolean(moveFrame);
  if (problem || clearStatus) setStatus(problem, Boolean(problem));
}

function renderPoses(selection = poses.value) {
  poses.replaceChildren(new Option(state.poses.length ? '저장 자세 선택' : '저장된 자세 없음', ''));
  for (const pose of state.poses) {
    const problem = poseProblem(state.model, pose);
    const suffix = !problem ? '' : problem.includes('구성') ? ' · 구성 다름' : ' · 한계 초과';
    poses.add(new Option(pose.name + suffix, pose.id));
  }
  poses.value = state.poses.some(pose => pose.id === selection) ? selection : '';
  poseButtons(true);
}

function stopMove(manual = false) {
  if (!moveFrame) return;
  cancelAnimationFrame(moveFrame);
  moveFrame = 0;
  if (referenceMove) {
    zeroStatus.textContent = referenceMove + ' 이동 중단';
    referenceMove = '';
  }
  persist();
  poseButtons(false);
  setStatus(manual ? 'MoveJ 중단 · 수동 조작' : 'MoveJ 중단');
}

function showActiveAngle() {
  const joint = state.model.joints[activeJoint];
  const angle = Number(state.angles[activeJoint].toFixed(1));
  element<HTMLOutputElement>('active-angle').value = `J${activeJoint + 1} · ${joint.axis} · ${angle}°`;
}

function checkMobility(solved: ReturnType<typeof solve>) {
  const { position, pose } = mobility(state.model, solved, reference);
  let level = 'normal';
  let summary = '정상';
  if (position.level === 'singular' || pose.level === 'singular') {
    level = 'singular';
    summary = position.level === 'singular' ? '위치 특이점' : '방향 특이점';
  } else if (position.level === 'near' || pose.level === 'near') {
    level = 'near';
    summary = position.level === 'near' ? '위치 특이점 근접' : '방향 특이점 근접';
  } else if (reference.position < 3 || reference.pose < 6) {
    level = 'limited';
    summary = reference.pose === 0 ? '모든 축 고정' : '구조 자유도 제한';
  }
  if (mobilitySummary.value !== summary) mobilitySummary.value = summary;
  scene?.setSingularityAlert(level === 'singular');
  mobilitySummary.closest('details')!.dataset.level = level;
  mobilityPosition.textContent = `TCP 위치 ${position.rank}/3 · 모델 기준 ${reference.position} · 민감도 ${(position.ratio * 100).toFixed(1)}%`;
  mobilityPose.textContent = `위치+방향 ${pose.rank}/6 · 모델 기준 ${reference.pose} · 민감도 ${(pose.ratio * 100).toFixed(1)}%`;
}

function updatePose(skipAngle?: HTMLInputElement) {
  const limits: string[] = [];
  for (const [i, fields] of jogFields.entries()) {
    const angle = state.angles[i];
    fields.range.value = String(angle);
    if (fields.angle !== skipAngle) fields.angle.value = String(Number(angle.toFixed(4)));
    const stateAtLimit = jointLimitStatus(state.model.joints[i], angle);
    (jog.children[i] as HTMLElement).dataset.limit = stateAtLimit;
    if (stateAtLimit !== 'free') {
      const message = stateAtLimit === 'locked' ? '고정' : stateAtLimit === 'at' ? '한계' : '한계 근접';
      limits.push(`J${i + 1} ${message}`);
    }
  }
  const limitText = limits.join(' · ');
  if (limitsSummary.textContent !== limitText) limitsSummary.textContent = limitText;
  const solved = solve(state.model, state.angles);
  checkMobility(solved);
  showActiveAngle();
  solved.tcp.toArray().forEach((value, i) => {
    coordinates[i].value = (Math.abs(value) < 0.05 ? 0 : value).toFixed(1);
  });
  const [x, y, z] = targetPosition(state.target);
  element<HTMLOutputElement>('target-current').value = Math.hypot(solved.tcp.x - x, solved.tcp.y - y, solved.tcp.z - z).toFixed(1);
  scene?.update(state.model, solved, activeJoint, state.display);
}

function refreshTarget() {
  const position = targetPosition(state.target);
  const z = position[2];
  const slice = slicePoints(workspaceSamples, z);
  element<HTMLOutputElement>('target-nearest').value = workspaceSamples.length
    ? nearestDistance(workspaceSamples, position).toFixed(1) : '표본 없음';
  const center = state.model.origin ?? [0, 0, 0];
  const outside = Math.hypot(...position.map((value, i) => value - center[i])) > radius(state.model) + 1e-8
    ? ' · 반경 상한 밖' : '';
  element('target-hint').textContent = `베이스 기준 목표 Z ${Number(z.toFixed(2))} mm${outside} · 단면 ±${sliceTolerance} mm · ${slice.length / 3}점`;
  scene?.setTarget(position, slice);
}

function updateStructure(topologyChanged = false) {
  if (state.preset === 'ur5e' && tableContact(solve(state.model, state.angles))) {
    state.angles = [...ur5eUprightAngles];
    tableStatus.textContent = '저장된 현재 자세에 정반 간섭이 있어 영자세로 재배치했습니다.';
  }
  element('axis-count').textContent = state.model.joints.length + '축';
  element<HTMLOutputElement>('bound').value = radius(state.model).toFixed(1) + ' mm';
  if (topologyChanged) renderJointList();
  else state.model.joints.forEach((joint, i) => { list.children[i].children[2].textContent = Number(joint.length.toFixed(1)) + ' mm'; });
  renderPoses();
  workspaceSamples = sample(state.model, 4096, state.preset === 'ur5e' ? solved => !tableContact(solved) : undefined);
  reference = mobilityReference(state.model);
  const visual = state.preset === 'ur5e' || isVendor(state.preset) ? state.preset : undefined;
  scene?.rebuild(state.model, visual);
  scene?.setSamples(workspaceSamples);
  refreshTarget();
  updatePose();
  persist();
}

function setActive(index: number) {
  if (activeJoint !== index) {
    activeJoint = index;
    renderEditor();
  }
  Array.from(list.children).forEach((child, i) => child.setAttribute('aria-pressed', String(i === index)));
  Array.from(jog.children).forEach((child, i) => child.classList.toggle('active', i === index));
  showActiveAngle();
  const solved = solve(state.model, state.angles);
  scene?.update(state.model, solved, activeJoint, state.display);
}

function renderJointList() {
  list.replaceChildren();
  state.model.joints.forEach((joint, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'joint-choice';
    button.setAttribute('aria-pressed', String(index === activeJoint));
    button.innerHTML = '<strong></strong><span class="joint-name"></span><span></span>';
    button.children[0].textContent = 'J' + (index + 1);
    button.children[1].textContent = joint.name;
      button.children[2].textContent = Number(joint.length.toFixed(1)) + ' mm';
    button.addEventListener('click', () => setActive(index));
    list.append(button);
  });
  add.disabled = state.preset !== 'custom' || state.model.joints.length >= maxJoints;
}

function numericCommit(input: HTMLInputElement, read: () => number, apply: (value: number) => void, invalid: () => void) {
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
    }
  });
  input.addEventListener('change', () => {
    if (!input.value.trim() || !input.validity.valid || !Number.isFinite(input.valueAsNumber)) {
      input.value = String(read());
      invalid();
      return;
    }
    if (read() !== input.valueAsNumber) apply(input.valueAsNumber);
  });
  input.addEventListener('blur', () => {
    input.value = String(read());
  });
}

function renderEditor() {
  const i = activeJoint;
  const joint = state.model.joints[i];
  const label = i + 1 === state.model.joints.length ? '플랜지' : 'J' + (i + 2);
  if (state.preset === 'factory') {
    editor.innerHTML = `<div class="editor-heading"><h3>원본 · J${i + 1} → ${label}</h3></div>
      <p class="hint">로컬 ${joint.axis} 회전 · ${joint.min}° ~ ${joint.max}°</p>
      <p class="hint">링크 ${joint.length} mm · 측면 ${joint.offset} mm</p>`;
    return;
  }
  if (state.preset === 'ur5e' || isVendor(state.preset)) {
    const name = state.preset === 'ur5e' ? 'UR5e' : vendorModels[state.preset].name;
    const limits = joint.continuous ? '연속 회전 · 조작 입력 ±360°'
      : `${Number(joint.min.toFixed(2))}° ~ ${Number(joint.max.toFixed(2))}°`;
    editor.innerHTML = `<div class="editor-heading"><h3>${name} · J${i + 1} → ${label}</h3></div>
      <p class="hint">로컬 ${joint.axis} 회전 · ${limits}</p>
      <p class="hint">다음 원점 XYZ · ${joint.vector?.map(value => Number(value.toFixed(2))).join(' / ')} mm</p>
      <p class="hint">공식 공칭 치수로 고정된 예제입니다.</p>`;
    return;
  }
  const options = axes.map(axis => '<option>' + axis + '</option>').join('');
  editor.innerHTML = `
    <div class="editor-heading">
      <h3>J${i + 1} → ${label}</h3>
      <button type="button" id="delete-joint" class="danger">관절 삭제</button>
    </div>
    <div class="field-grid">
      <label class="field">회전축<select id="edit-axis">${options}</select></label>
      <label class="field">길이 방향<select id="edit-direction">${options}</select></label>
      <label class="field">링크 길이
        <span class="input-unit"><input id="edit-length" type="number" min="0" max="${maxLength}" step="any" /><span>mm</span></span>
      </label>
      <label class="field"><span id="offset-label"></span>
        <span class="input-unit"><input id="edit-offset" type="number" min="-${maxLength}" max="${maxLength}" step="any" /><span>mm</span></span>
      </label>
      <label class="field">최소 각도
        <span class="input-unit"><input id="edit-min" type="number" min="-${maxAngle}" step="any" /><span>°</span></span>
      </label>
      <label class="field">최대 각도
        <span class="input-unit"><input id="edit-max" type="number" max="${maxAngle}" step="any" /><span>°</span></span>
      </label>
    </div>
    <p id="edit-error" class="hint error status" role="status"></p>`;

  const minimum = element<HTMLInputElement>('edit-min');
  const maximum = element<HTMLInputElement>('edit-max');
  const error = element('edit-error');
  function editNotice(text: string) { error.textContent = text; }
  function applyLimits() {
    minimum.max = String(joint.max);
    maximum.min = String(joint.min);
  }
  function describeOffset() {
    element('offset-label').textContent = '측면 오프셋 · ' + offsetAxis(joint.direction);
  }
  applyLimits();
  describeOffset();

  for (const property of ['axis', 'direction'] as const) {
    const select = element<HTMLSelectElement>('edit-' + property);
    select.value = joint[property];
    select.addEventListener('change', () => {
      stopMove();
      joint[property] = select.value as Axis;
      describeOffset();
      refreshJogLimits();
      updateStructure();
      editNotice('');
    });
  }
  for (const property of ['length', 'offset', 'min', 'max'] as const) {
    const input = element<HTMLInputElement>('edit-' + property);
    input.value = String(joint[property]);
    numericCommit(input, () => joint[property], value => {
      stopMove();
      joint[property] = value;
      state.angles[i] = clampAngle(state.angles[i], joint);
      applyLimits();
      refreshJogLimits();
      updateStructure();
      editNotice('');
    }, () => editNotice('입력 범위를 확인해 주세요.'));
  }
  const remove = element<HTMLButtonElement>('delete-joint');
  remove.disabled = state.model.joints.length === 1;
  remove.addEventListener('click', () => {
    stopMove();
    state.model.joints.splice(i, 1);
    state.angles.splice(i, 1);
    activeJoint = Math.min(i, state.model.joints.length - 1);
    renderEditor();
    renderJog();
    updateStructure(true);
    (list.children[activeJoint] as HTMLButtonElement).focus();
  });
}

function refreshJogLimits() {
  state.model.joints.forEach((joint, i) => {
    const { range, angle } = jogFields[i];
    for (const input of [range, angle]) {
      input.min = String(joint.min);
      input.max = String(joint.max);
      input.disabled = joint.min === joint.max;
    }
    element('jog-min-' + i).textContent = Number(joint.min.toFixed(2)) + '°';
    element('jog-max-' + i).textContent = Number(joint.max.toFixed(2)) + '°';
    element('jog-type-' + i).textContent = joint.continuous ? '연속 회전' : '';
    const axis = element('jog-axis-' + i);
    axis.textContent = joint.axis;
    axis.className = 'jog-axis ' + joint.axis.toLowerCase();
  });
}

function renderJog() {
  jog.replaceChildren();
  angleInputStatus.textContent = '';
  jogFields.length = 0;
  state.model.joints.forEach((_, index) => {
    const row = document.createElement('div');
    row.className = 'jog-row' + (activeJoint === index ? ' active' : '');
    row.innerHTML = `
      <div class="jog-head">
        <label class="jog-joint" for="jog-angle-${index}">J${index + 1}</label>
        <span id="jog-axis-${index}"></span>
        <span class="input-unit"><input id="jog-angle-${index}" type="number" step="any" aria-label="J${index + 1} 각도" /><span>°</span></span>
      </div>
      <input id="jog-range-${index}" type="range" step="any" aria-label="J${index + 1} 조그" />
      <div class="jog-limits"><span id="jog-min-${index}"></span><span id="jog-type-${index}"></span><span id="jog-max-${index}"></span></div>`;
    jog.append(row);
    const range = element<HTMLInputElement>('jog-range-' + index);
    const angle = element<HTMLInputElement>('jog-angle-' + index);
    jogFields.push({ range, angle });
    row.addEventListener('focusin', () => setActive(index));
    row.addEventListener('pointerdown', () => {
      setActive(index);
      stopMove(true);
    });
    for (const input of [range, angle]) {
      input.addEventListener('input', () => {
        stopMove(true);
        const joint = state.model.joints[index];
        if (!Number.isFinite(input.valueAsNumber) || (input === angle && !angle.validity.valid)) {
          angle.setAttribute('aria-invalid', 'true');
          const label = joint.continuous ? '화면 입력 범위' : '허용 범위';
          angleInputStatus.textContent = `J${index + 1} ${label} ${Number(joint.min.toFixed(2))}° ~ ${Number(joint.max.toFixed(2))}°`;
          return;
        }
        angle.removeAttribute('aria-invalid');
        angleInputStatus.textContent = '';
        setJointAngle(index, input.valueAsNumber, input === angle ? angle : undefined);
      });
    }
    angle.addEventListener('blur', () => {
      angle.removeAttribute('aria-invalid');
      angle.value = String(state.angles[index]);
    });
    angle.addEventListener('keydown', event => {
      if (event.key === 'Enter') angle.blur();
    });
    range.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
      event.preventDefault();
      stopMove(true);
      angleInputStatus.textContent = '';
      const { min, max } = state.model.joints[index];
      const before = state.angles[index];
      const step = event.key.startsWith('Page') ? 10 : 1;
      const delta = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(event.key) ? step : -step;
      setJointAngle(index, event.key === 'Home' ? min : event.key === 'End' ? max : before + delta);
    });
  });
  refreshJogLimits();
}

add.addEventListener('click', () => {
  if (state.preset !== 'custom' || state.model.joints.length >= maxJoints) return;
  stopMove();
  state.model.joints.push({
    id: crypto.randomUUID(), name: '추가 관절', axis: 'Y', direction: 'Z',
    min: -180, max: 180, length: 80, offset: 0,
  });
  state.angles.push(0);
  activeJoint = state.model.joints.length - 1;
  renderEditor();
  renderJog();
  updateStructure(true);
  (list.children[activeJoint] as HTMLButtonElement).focus();
});

tool.value = String(state.model.tool);
numericCommit(tool, () => state.model.tool, value => {
  stopMove();
  state.model.tool = value;
  updateStructure();
}, () => {
  // Restore the last valid length; the native input exposes its numeric range.
});

for (const key of ['x', 'y', 'height'] as const) {
  const input = element<HTMLInputElement>('target-' + key);
  input.value = String(state.target[key]);
  numericCommit(input, () => state.target[key], value => {
    state.target[key] = value;
    refreshTarget();
    updatePose();
    persist();
  }, () => {});
}
for (const key of ['sphere', 'points', 'frames', 'slice', 'dummy', 'marks'] as const) {
  const checkbox = element<HTMLInputElement>(key);
  checkbox.checked = state.display[key];
  checkbox.addEventListener('change', () => {
    state.display[key] = checkbox.checked;
    updatePose();
    persist();
  });
}
fit.addEventListener('click', () => scene?.fit());
topView.addEventListener('click', () => scene?.fit(true));
pointerMode.addEventListener('change', () => {
  scene?.setMode(pointerMode.value as PointerMode);
  element('pointer-hint').hidden = pointerMode.value !== 'jog';
  element('mouse-guide').textContent = pointerMode.value === 'orbit' ?
    '드래그 회전 · 휠 확대 · 우클릭 드래그 이동' :
    pointerMode.value === 'locked' ? '시점 고정 중' : '드래그 조그 중';
});
scene?.setMode('orbit');

const tabs = ['structure', 'example'] as const;
function showTab(active: typeof tabs[number]) {
  for (const name of tabs) {
    const tab = element(name + '-tab');
    tab.setAttribute('aria-selected', String(name === active));
    tab.tabIndex = name === active ? 0 : -1;
    element(name + '-panel').hidden = name !== active;
  }
}
for (const [index, name] of tabs.entries()) {
  const tab = element(name + '-tab');
  tab.addEventListener('click', () => showTab(name));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs[1 - index];
    showTab(next);
    element(next + '-tab').focus();
  });
}
const availablePresets: Preset[] = ['custom', 'ur5e', 'factory', ...vendorIds];
function displayPreset() {
  for (const preset of availablePresets) {
    element<HTMLButtonElement>('load-' + preset).disabled = state.preset === preset;
  }
  element('structure-title').textContent = state.preset === 'ur5e' ? 'UR5e'
    : state.preset === 'factory' ? '기본 6축 팔 · 원본'
    : isVendor(state.preset) ? vendorModels[state.preset].name : '팔 모델';
  element('ur-range-panel').hidden = state.preset !== 'ur5e';
  element('angle-reference').hidden = state.preset !== 'ur5e';
  zeroButton.textContent = isVendor(state.preset) ? '기준 자세 이동' : '영자세 이동';
  tool.disabled = state.preset === 'factory';
  urRange.value = state.ur5eRange;
  urRangeStatus.textContent = '';
}
for (const preset of availablePresets) {
  element('load-' + preset).addEventListener('click', () => {
    stopMove();
    switchPreset(state, preset);
    activeJoint = 0;
    tool.value = String(state.model.tool);
    zeroStatus.textContent = '';
    tableStatus.textContent = '';
    renderEditor();
    renderJog();
    updateStructure(true);
    displayPreset();
    showTab('structure');
    element('structure-tab').focus();
    scene?.fit();
  });
}

urRange.addEventListener('change', () => {
  if (state.preset !== 'ur5e') return;
  stopMove();
  const next = urRange.value as Ur5eRange;
  const model = makeUr5e(next);
  if (model.joints.some((joint, index) => clampAngle(state.angles[index], joint) !== state.angles[index])) {
    urRange.value = state.ur5eRange;
    urRangeStatus.textContent = 'J3를 ±160° 안쪽으로 움직인 뒤 변경하세요.';
    return;
  }
  urRangeStatus.textContent = '';
  model.tool = state.model.tool;
  state.model = model;
  state.ur5eRange = next;
  refreshJogLimits();
  renderEditor();
  updateStructure();
});

const poseName = element<HTMLInputElement>('pose-name');
element<HTMLFormElement>('save-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = poseName.value.trim();
  if (!name) {
    setStatus('자세 이름을 입력해 주세요.', true);
    poseName.focus();
    return;
  }
  const id = crypto.randomUUID();
  state.poses.push({
    id, name,
    joints: state.model.joints.map(joint => [joint.id, joint.axis]),
    angles: [...state.angles],
  });
  poseName.value = '';
  renderPoses(id);
  persist();
  setStatus(name + ' 저장 완료');
});
poses.addEventListener('change', () => poseButtons(true));
removePose.addEventListener('click', () => {
  const pose = selectedPose();
  if (!pose) return;
  state.poses = state.poses.filter(item => item.id !== pose.id);
  renderPoses('');
  persist();
  setStatus(pose.name + ' 삭제 완료');
});

function startMove(angles: readonly number[], name: string) {
  tableStatus.textContent = '';
  const from = [...state.angles];
  const start = performance.now();
  const largestChange = Math.max(...from.map((angle, i) => Math.abs(angle - angles[i])));
  const duration = Math.min(3000, Math.max(550, largestChange / 100 * 1000));
  function tick(now: number) {
    const time = Math.min(1, (now - start) / duration);
    const next = interpolate(from, angles, time);
    const contact = state.preset === 'ur5e' ? tableContact(solve(state.model, next)) : 0;
    if (contact) {
      stopMove();
      tableStatus.textContent = `정반 간섭으로 이동을 멈췄습니다 · J${contact} 링크`;
      return;
    }
    state.angles = next;
    updatePose();
    if (time < 1) {
      moveFrame = requestAnimationFrame(tick);
      return;
    }
    moveFrame = 0;
    if (referenceMove) zeroStatus.textContent = referenceMove + ' 이동 완료';
    referenceMove = '';
    persist();
    poseButtons(false);
    setStatus(name + ' 이동 완료');
  }
  moveFrame = requestAnimationFrame(tick);
  poseButtons(false);
  setStatus(name + ' 이동 중');
}

move.addEventListener('click', () => {
  const target = selectedPose();
  if (!target || moveFrame) return;
  const problem = poseProblem(state.model, target);
  if (problem) {
    setStatus(problem, true);
    return;
  }
  const contact = state.preset === 'ur5e' ? pathContact(state.model, state.angles, target.angles) : 0;
  if (contact) {
    const message = `MoveJ 경로에 정반 간섭이 있습니다 · J${contact} 링크`;
    tableStatus.textContent = message;
    setStatus(message, true);
    return;
  }
  startMove(target.angles, target.name);
});
function moveToReference(angles: readonly number[], name: string) {
  stopMove();
  referenceMove = name;
  zeroStatus.classList.remove('error');
  zeroStatus.textContent = name + ' 이동 중';
  startMove(angles, name);
}

zeroButton.addEventListener('click', () => {
  if (isVendor(state.preset)) {
    moveToReference(vendorModels[state.preset].home, '기준 자세');
    return;
  }
  if (state.preset === 'ur5e') {
    if (pathContact(state.model, state.angles, ur5eUprightAngles)) {
      stopMove();
      state.angles = [...ur5eUprightAngles];
      updatePose();
      persist();
      tableStatus.textContent = '직접 이동 경로에 정반 간섭이 있어 영자세로 재배치했습니다.';
      zeroStatus.textContent = '수직 영자세 재배치 완료';
    } else moveToReference(ur5eUprightAngles, '수직 영자세');
    return;
  }
  const blocked = zeroBlockedAxes(state.model);
  zeroStatus.classList.toggle('error', blocked.length > 0);
  if (blocked.length) {
    zeroStatus.textContent = '0°가 한계 밖입니다 · ' + blocked.join(', ');
    return;
  }
  moveToReference(state.model.joints.map(() => 0), '영자세');
});
window.addEventListener('pagehide', persist);

renderEditor();
renderJog();
updateStructure(true);
displayPreset();
scene?.fit();
