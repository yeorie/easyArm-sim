import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

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
  assert.deepEqual(errors, []);
  console.log('Edge: 로봇 캔버스, 좌표계·점군, 마우스 조그, 6→4→5축, +50 mm, TCP, 저장·새로고침·MoveJ·중단·한계와 삭제 통과');
} finally {
  await browser.close();
}
