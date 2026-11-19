import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(
  new URL('../../packages/design-system/src/arabic-accessibility.css', import.meta.url),
  'utf8',
);
function color(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css);
  assert.ok(match, `Missing token: ${name}`);
  return match[1]!;
}
function luminance(hex: string): number {
  const values = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
}
function contrast(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('Arabic text tokens meet 4.5:1 on the intended light surfaces', () => {
  for (const background of ['#ffffff', '#f6f7f5', '#f5f5ef', '#f0f8e4']) {
    assert.ok(contrast(color('muted'), background) >= 4.5, background);
  }
  for (const [foreground, background] of [
    ['green', '#e5f2ec'],
    ['warning', '#fff4dd'],
    ['danger', '#fbeceb'],
    ['info', '#eaf1f8'],
  ]) {
    assert.ok(contrast(color(foreground!), background!) >= 4.5, foreground);
  }
  assert.ok(contrast('#ffffff', color('accent')) >= 4.5);
});

test('controls and focus have distinguishable outlines and readable Arabic sizing', () => {
  assert.ok(contrast(color('control-border'), '#ffffff') >= 3);
  assert.ok(contrast(color('focus-ring'), '#ffffff') >= 3);
  assert.match(css, /min-block-size: 44px/);
  assert.match(css, /font-size: 1rem/);
  assert.match(css, /letter-spacing: normal/);
  assert.match(css, /forced-colors: active/);
  assert.doesNotMatch(css, /@import|https?:|url\(/);
});

test('both build pipelines include and fingerprint the Arabic UX layer', async () => {
  for (const name of ['build-apps.mts', 'build-rep-server.mts']) {
    const script = await readFile(
      new URL(`../../tooling/scripts/${name}`, import.meta.url),
      'utf8',
    );
    assert.match(script, /packages\/design-system\/src\/arabic-accessibility\.css/);
    assert.match(script, name === 'build-apps.mts' ? /arabicCssPath,/ : /arabicCssInput,/);
  }
});
