import './style.css';
import { axes, clampAngle, interpolate, offsetAxis, poseProblem, radius, solve, type Axis } from './kinematics.ts';
import { createScene } from './scene.ts';
import { maxAngle, maxJoints, maxLength, readState, storageKey } from './storage.ts';

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
const status = element('status');
const sceneHost = element('scene');
const coordinates = ['tcp-x', 'tcp-y', 'tcp-z'].map(id => element<HTMLOutputElement>(id));
const jogFields: { range: HTMLInputElement; angle: HTMLInputElement }[] = [];

let activeJoint = 0;
let scene: ReturnType<typeof createScene> | undefined;
let moveFrame = 0;
try {
  scene = createScene(sceneHost);
} catch {
  const error = document.createElement('p');
  error.className = 'scene-error';
  error.textContent = '3D 뷰를 열 수 없습니다. WebGL2를 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.';
  sceneHost.append(error);
  fit.disabled = true;
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
  persist();
  poseButtons(false);
  setStatus(manual ? 'MoveJ 중단 · 수동 조작' : 'MoveJ 중단');
}

function updatePose(skipAngle?: HTMLInputElement) {
  for (const [i, fields] of jogFields.entries()) {
    const angle = state.angles[i];
    fields.range.value = String(angle);
    if (fields.angle !== skipAngle) fields.angle.value = String(Number(angle.toFixed(4)));
  }
  const solved = solve(state.model, state.angles);
  solved.tcp.toArray().forEach((value, i) => {
    coordinates[i].value = (Math.abs(value) < 0.05 ? 0 : value).toFixed(1);
  });
  scene?.update(state.model, solved, activeJoint, state.display);
}

function updateStructure(topologyChanged = false) {
  element('axis-count').textContent = state.model.joints.length + '축';
  element<HTMLOutputElement>('bound').value = radius(state.model).toFixed(1) + ' mm';
  if (topologyChanged) renderJointList();
  else state.model.joints.forEach((joint, i) => { list.children[i].children[2].textContent = joint.length + ' mm'; });
  renderPoses();
  scene?.rebuild(state.model);
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
    button.children[2].textContent = joint.length + ' mm';
    button.addEventListener('click', () => setActive(index));
    list.append(button);
  });
  add.disabled = state.model.joints.length >= maxJoints;
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
    element('jog-min-' + i).textContent = joint.min + '°';
    element('jog-max-' + i).textContent = joint.max + '°';
    const axis = element('jog-axis-' + i);
    axis.textContent = joint.axis;
    axis.className = 'jog-axis ' + joint.axis.toLowerCase();
  });
}

function renderJog() {
  jog.replaceChildren();
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
      <div class="jog-limits"><span id="jog-min-${index}"></span><span id="jog-max-${index}"></span></div>`;
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
        if (!Number.isFinite(input.valueAsNumber)) return;
        const joint = state.model.joints[index];
        if (input === angle && !angle.validity.valid) return;
        state.angles[index] = Number(clampAngle(input.valueAsNumber, joint).toFixed(4));
        state.angles[index] = clampAngle(state.angles[index], joint);
        updatePose(input === angle ? angle : undefined);
        persist();
      });
    }
    angle.addEventListener('blur', () => { angle.value = String(state.angles[index]); });
    angle.addEventListener('keydown', event => {
      if (event.key === 'Enter') angle.blur();
    });
    range.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) return;
      event.preventDefault();
      stopMove(true);
      const { min, max } = state.model.joints[index];
      const before = state.angles[index];
      const step = event.key.startsWith('Page') ? 10 : 1;
      const delta = ['ArrowRight', 'ArrowUp', 'PageUp'].includes(event.key) ? step : -step;
      state.angles[index] = Math.min(max, Math.max(min,
        event.key === 'Home' ? min : event.key === 'End' ? max : before + delta));
      updatePose();
      persist();
    });
  });
  refreshJogLimits();
}

add.addEventListener('click', () => {
  if (state.model.joints.length >= maxJoints) return;
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

for (const key of ['sphere', 'points', 'frames'] as const) {
  const checkbox = element<HTMLInputElement>(key);
  checkbox.checked = state.display[key];
  checkbox.addEventListener('change', () => {
    state.display[key] = checkbox.checked;
    updatePose();
    persist();
  });
}
fit.addEventListener('click', () => scene?.fit());

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

move.addEventListener('click', () => {
  const target = selectedPose();
  if (!target || moveFrame) return;
  const problem = poseProblem(state.model, target);
  if (problem) {
    setStatus(problem, true);
    return;
  }
  const from = [...state.angles];
  const start = performance.now();
  const largestChange = Math.max(...from.map((angle, i) => Math.abs(angle - target.angles[i])));
  const duration = Math.min(3000, Math.max(550, largestChange / 100 * 1000));
  function tick(now: number) {
    const time = Math.min(1, (now - start) / duration);
    state.angles = interpolate(from, target!.angles, time);
    updatePose();
    if (time < 1) {
      moveFrame = requestAnimationFrame(tick);
      return;
    }
    moveFrame = 0;
    persist();
    poseButtons(false);
    setStatus(target!.name + ' 이동 완료');
  }
  moveFrame = requestAnimationFrame(tick);
  poseButtons(false);
  setStatus(target.name + ' 이동 중');
});
window.addEventListener('pagehide', persist);

renderEditor();
renderJog();
updateStructure(true);
scene?.fit();
