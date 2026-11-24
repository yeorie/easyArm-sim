import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { PerspectiveCamera, Vector3 } from 'three';
import { example, initialAngles } from '../src/example.ts';
import { radius, solve } from '../src/kinematics.ts';

const url = process.env.EASYARM_URL ?? 'http://127.0.0.1:4173/easyArm-sim/';
const browser = await chromium.launch({
  channel: 'msedge',
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
  });
  const read = (id) => page.locator(id).innerText();
  const field = (id) => page.locator(id).inputValue();
  const allAngles = () => page.locator('.jog-row input[type=number]').evaluateAll(inputs => inputs.map(input => Number(input.value)));
  const tcp = () => page.locator('.tcp-values output').allTextContents();
  const setField = async (id, value) => {
    const input = page.locator(id);
    await input.fill(String(value));
    await input.press('Tab');
  };
  const countJoints = async (count) => {
    assert.equal(await page.locator('.joint-choice').count(), count);
    assert.equal(await page.locator('.jog-row input[type=range]').count(), count);
    assert.match(await read('#axis-count'), new RegExp(count + '\\s*축'));
  };
  await page.goto(url);
  await page.locator('canvas').waitFor();
  await countJoints(6);
  assert.equal(await page.locator('#sphere').isChecked(), false);
  assert.equal(await page.locator('#slice').isChecked(), true);
  assert.equal(await page.locator('.scene-error').count(), 0);
  assert.equal(await page.locator('#upright').isHidden(), true);
  const beforeView = await page.locator('canvas').screenshot();
  if (process.env.EASYARM_SCREENSHOT) await page.screenshot({ path: process.env.EASYARM_SCREENSHOT });

  await page.locator('#sphere').check();
  const sphereView = await page.locator('canvas').screenshot();
  assert.notDeepEqual(sphereView, beforeView, '상한 구 토글이 렌더링을 바꾼다');
  await page.locator('#sphere').uncheck();
  await page.locator('#top-view').click();
  const plate = await page.locator('canvas').boundingBox();
  await page.locator('canvas').dblclick({ position: { x: plate.width * 0.56, y: plate.height * 0.47 } });
  assert.notEqual(await field('#target-x'), '350');
  assert.equal(Math.abs(Number(await field('#target-x')) % 25), 0);
  assert.equal(Math.abs(Number(await field('#target-y')) % 25), 0);
  await page.locator('#fit').click();
  await setField('#target-height', 300);
  assert.match(await read('#target-hint'), /Z 238 mm/);
  await setField('#target-x', 2000);
  assert.match(await read('#target-hint'), /반경 상한 밖/);
  await setField('#target-x', 350);
  assert.doesNotMatch(await read('#target-hint'), /반경 상한 밖/);
  const workspaceDistance = await read('#target-nearest');
  const targetDistance = await read('#target-current');
  const beforeFrames = await page.locator('canvas').screenshot();
  await page.locator('#frames').check();
  const framesView = await page.locator('canvas').screenshot();
  assert.notDeepEqual(framesView, beforeFrames, '좌표계 토글이 렌더링을 바꾼다');
  await page.locator('#points').check();
  const pointView = await page.locator('canvas').screenshot();
  assert.notDeepEqual(pointView, framesView, '점군 토글이 렌더링을 바꾼다');

  const beforeJog = await tcp();
  const boundBefore = await read('#bound');
  const slider = page.locator('#jog-range-1');
  const track = await slider.boundingBox();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width * 0.7, track.y + track.height / 2, { steps: 5 });
  await page.mouse.up();
  assert.notDeepEqual(await tcp(), beforeJog);
  assert.equal(await read('#bound'), boundBefore);
  assert.equal(await read('#target-nearest'), workspaceDistance);
  assert.notEqual(await read('#target-current'), targetDistance);
  assert.deepEqual(await page.locator('canvas').getAttribute('aria-label'), '3D 로봇팔과 작업공간');

  for (const joint of [2, 3]) {
    await page.locator('.joint-choice').nth(joint).click();
    await page.locator('#delete-joint').click();
  }
  await countJoints(4);
  assert.deepEqual(await page.locator('.joint-choice .joint-name').allTextContents(), ['베이스', '어깨', '손목 회전', '플랜지']);
  assert.ok((await tcp()).every(value => Number.isFinite(Number(value))));
  const editedView = await page.locator('canvas').screenshot();
  assert.notDeepEqual(editedView, pointView);
  await page.locator('#add-joint').click();
  await countJoints(5);
  await page.locator('#delete-joint').click();
  await countJoints(4);

  await page.locator('.joint-choice').first().click();
  const beforeLength = await tcp();
  const bound = Number((await read('#bound')).split(' ')[0]);
  const angleBefore = await allAngles();
  const oldLength = Number(await field('#edit-length'));
  await setField('#edit-length', '');
  assert.equal(Number(await field('#edit-length')), oldLength);
  assert.deepEqual(await tcp(), beforeLength);
  await setField('#edit-length', oldLength + 50);
  assert.deepEqual(await allAngles(), angleBefore);
  assert.notDeepEqual(await tcp(), beforeLength);
  assert.ok(Math.abs(Number((await read('#bound')).split(' ')[0]) - bound - 50) < 0.05);
  const afterLength = await tcp();
  await setField('#tool-length', 102);
  assert.notDeepEqual(await tcp(), afterLength);

  await setField('#jog-angle-1', 42.5);
  const saved = await allAngles();
  assert.equal(saved[1], 42.5);
  await page.locator('#pose-name').fill('홈');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await setField('#jog-angle-0', -40);
  const jogged = await allAngles();
  assert.notDeepEqual(jogged, saved);
  await page.reload();
  await countJoints(4);
  assert.equal(await field('#target-height'), '300');
  assert.deepEqual(await allAngles(), jogged);
  assert.equal(await page.locator('#pose-select option').last().innerText(), '홈');
  await page.locator('#pose-select').selectOption({ label: '홈' });
  await page.locator('#move').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('완료'));
  assert.deepEqual(await allAngles(), saved);

  await page.locator('.joint-choice').first().click();
  await setField('#edit-length', oldLength + 100);
  await setField('#jog-angle-0', -40);
  await page.locator('#move').click();
  await page.locator('#jog-range-2').press('ArrowRight');
  const manual = await allAngles();
  await page.waitForTimeout(1350);
  assert.deepEqual(await allAngles(), manual);
  assert.match(await read('#status'), /수동/);
  await page.locator('#move').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('완료'));
  assert.deepEqual(await allAngles(), saved);

  await page.locator('.joint-choice').nth(1).click();
  await setField('#edit-max', 40);
  assert.equal(await page.locator('#move').isDisabled(), true);
  assert.match(await read('#status'), /J2.*42.5/);
  await page.locator('#edit-axis').selectOption('X');
  assert.match(await read('#status'), /구성/);
  await page.locator('#delete-pose').click();
  assert.equal(await page.locator('#pose-select option').count(), 1);

  const customAngles = await allAngles();
  await page.locator('#example-tab').click();
  await page.locator('#load-ur5e').click();
  await page.locator('.scene[data-appearance="ur5e"]').waitFor();
  if (process.env.EASYARM_UR5E_SCREENSHOT) await page.screenshot({ path: process.env.EASYARM_UR5E_SCREENSHOT });
  await countJoints(6);
  assert.match(await read('#structure-title'), /UR5e/);
  assert.deepEqual(await tcp(), ['491.9', '133.3', '487.9']);
  assert.equal(await field('#ur-range-profile'), 'sw5');
  assert.equal(await page.locator('#jog-angle-2').getAttribute('max'), '160');
  assert.equal(await page.locator('#jog-angle-5').getAttribute('max'), '360');
  assert.equal(await page.locator('.pose-check').getAttribute('data-level'), 'normal');
  await setField('#jog-angle-2', 175);
  assert.equal((await allAngles())[2], 90);
  assert.match(await read('#angle-input-status'), /J3.*160°/);
  assert.equal(await page.locator('#add-joint').isDisabled(), true);
  await page.locator('#pointer-mode').selectOption('jog');
  await page.mouse.move(745, 411);
  await page.mouse.down();
  await page.mouse.move(785, 440, { steps: 6 });
  await page.mouse.up();
  assert.match(await read('#active-angle'), /^J2 /);
  assert.notEqual((await allAngles())[1], -90);
  await page.locator('#pointer-mode').selectOption('orbit');
  await page.locator('#upright').click();
  await page.waitForFunction(() => document.querySelector('#zero-status').textContent.includes('완료'));
  assert.deepEqual(await allAngles(), [0, -90, 0, 0, 90, 0]);
  assert.deepEqual(await tcp(), ['99.7', '133.3', '1079.3']);
  assert.equal(await page.locator('.pose-check').getAttribute('data-level'), 'singular');
  await page.locator('#zero').click();
  await page.waitForFunction(() => document.querySelector('#zero-status').textContent.includes('완료'));
  assert.deepEqual(await allAngles(), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(await tcp(), ['817.2', '232.9', '62.8']);
  await page.locator('#ur-range-profile').selectOption('polyscope-x');
  assert.equal(await page.locator('#jog-angle-2').getAttribute('max'), '360');
  await setField('#jog-angle-2', 175);
  await page.locator('#pose-name').fill('J3 175°');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  await page.locator('#ur-range-profile').selectOption('sw5');
  assert.equal(await field('#ur-range-profile'), 'polyscope-x');
  assert.match(await read('#ur-range-status'), /J3.*160/);
  assert.equal((await allAngles())[2], 175);
  await setField('#jog-angle-2', 160);
  await page.locator('#ur-range-profile').selectOption('sw5');
  assert.match(await read('#limits-summary'), /J3 한계/);
  assert.equal(await page.locator('#move').isDisabled(), true);
  assert.match(await read('#status'), /J3.*175/);
  await page.locator('#zero').click();
  await page.waitForFunction(() => document.querySelector('#zero-status').textContent.includes('완료'));
  const withDummy = await page.locator('canvas').screenshot();
  await page.locator('#dummy').uncheck();
  assert.notDeepEqual(await page.locator('canvas').screenshot(), withDummy);
  assert.deepEqual(await tcp(), ['817.2', '232.9', '62.8']);
  await page.locator('#dummy').check();
  await setField('#jog-angle-5', 90);
  assert.deepEqual(await tcp(), ['817.2', '232.9', '62.8']);
  assert.notDeepEqual(await page.locator('canvas').screenshot(), withDummy);
  await page.reload();
  await page.locator('.scene[data-appearance="ur5e"]').waitFor();
  assert.match(await read('#structure-title'), /UR5e/);
  assert.equal((await allAngles())[5], 90);
  await page.locator('#example-tab').click();
  await page.locator('#load-custom').click();
  assert.equal(await page.locator('#scene').getAttribute('data-appearance'), 'custom');
  await countJoints(4);
  assert.deepEqual(await allAngles(), customAngles);
  await page.locator('.joint-choice').first().click();
  await setField('#edit-min', 5);
  await page.locator('#zero').click();
  assert.match(await read('#zero-status'), /한계 밖.*J1/);
  assert.deepEqual(errors, []);

  const pointerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await pointerPage.goto(url);
  const canvas = pointerPage.locator('canvas');
  await canvas.waitFor();
  const pointerModes = pointerPage.locator('#pointer-mode');
  const output = pointerPage.locator('#active-angle');
  const angle = (i) => pointerPage.locator('#jog-angle-' + i).inputValue();
  async function drag(x, y, dx, dy) {
    await pointerPage.mouse.move(x, y);
    await pointerPage.mouse.down();
    await pointerPage.mouse.move(x + dx, y + dy, { steps: 8 });
    await pointerPage.mouse.up();
  }
  await pointerModes.selectOption('locked');
  const fixedView = await canvas.screenshot();
  await drag(600, 250, 70, 40);
  assert.deepEqual(await canvas.screenshot(), fixedView);
  await pointerModes.selectOption('jog');
  const canvasRect = await canvas.boundingBox();
  const perspective = new PerspectiveCamera(42, canvasRect.width / canvasRect.height, 1, 2000000);
  perspective.up.set(0, 0, 1);
  const reach = radius(example);
  const focus = new Vector3(0, 0, reach * 0.035);
  const vertical = Math.PI * 42 / 360;
  const halfAngle = Math.min(vertical, Math.atan(Math.tan(vertical) * perspective.aspect));
  perspective.position.copy(focus).addScaledVector(new Vector3(0.78, -1, 0.67).normalize(), reach * 1.28 / Math.sin(halfAngle));
  perspective.lookAt(focus);
  perspective.updateMatrixWorld();
  function pixels(vector) {
    const point = vector.clone().project(perspective);
    return [canvasRect.x + (point.x + 1) * canvasRect.width / 2, canvasRect.y + (1 - point.y) * canvasRect.height / 2];
  }
  const fk = solve(example, initialAngles);
  await drag(...pixels(fk.frames[2].origin), 52, 27);
  assert.notEqual(await angle(2), String(initialAngles[2]));
  assert.match(await output.innerText(), /^J3 /);
  assert.equal(await angle(1), String(initialAngles[1]));
  const elbow = pointerPage.locator('#jog-angle-2');
  await elbow.fill(String(initialAngles[2]));
  await elbow.press('Tab');
  await drag(...pixels(fk.tcp), 52, 27);
  assert.notEqual(await angle(2), String(initialAngles[2]));
  assert.equal(await angle(5), String(initialAngles[5]));
  assert.match(await output.innerText(), /^J3 /);
  await pointerPage.locator('#zero').click();
  await pointerPage.waitForFunction(() => document.querySelector('#zero-status').textContent.includes('완료'));
  assert.deepEqual(await pointerPage.locator('.tcp-values output').allTextContents(), ['0.0', '0.0', '788.0']);
  assert.equal(await pointerPage.locator('.pose-check').getAttribute('data-level'), 'singular');
  const legacy = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await legacy.addInitScript(({ model, initial }) => {
    localStorage.setItem('easyArm-sim:v1', JSON.stringify({ model, angles: initial }));
  }, {
    model: { ...example, joints: example.joints.map((joint, i) => i === 2 ? { ...joint, offset: -48 } : joint) },
    initial: [18, 38, -66, 22, 64, -20],
  });
  await legacy.goto(url);
  await legacy.locator('canvas').waitFor();
  assert.equal(await legacy.locator('#jog-angle-2').inputValue(), String(initialAngles[2]));
  assert.equal(await legacy.locator('.pose-check').getAttribute('data-level'), 'normal');
  assert.ok(await legacy.locator('body').evaluate(body => body.scrollWidth <= window.innerWidth));
  console.log('Edge: UR5e 관절 범위 전환·0°·직립·특이점, 범용 0° TCP, 한계 및 기존 조작 통과');
} finally {
  await browser.close();
}
