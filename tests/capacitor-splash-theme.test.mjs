import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const NATIVE_SPLASH_BACKGROUND = '#f7f5f2';

async function readText(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('capacitor splash uses theme-neutral background (#179)', async () => {
  const config = await readText('apps/mobile/capacitor.config.ts');

  assert.match(config, /NATIVE_SPLASH_BACKGROUND\s*=\s*'#f7f5f2'/);
  assert.match(config, /backgroundColor:\s*NATIVE_SPLASH_BACKGROUND/);
  assert.match(config, /launchAutoHide:\s*false/);
  assert.match(config, /cannot read hobbit-theme-mode/i);
  assert.doesNotMatch(config, /#0A0A0A/i);
});

test('android splash resources use theme-neutral background (#179)', async () => {
  const colors = await readText(
    'apps/mobile/android/app/src/main/res/values/colors.xml',
  );
  const styles = await readText(
    'apps/mobile/android/app/src/main/res/values/styles.xml',
  );

  assert.match(
    colors,
    new RegExp(`splash_background">${NATIVE_SPLASH_BACKGROUND}<`),
  );
  assert.match(
    styles,
    /windowSplashScreenBackground">@color\/splash_background</,
  );
  assert.match(styles, /no JS \/ localStorage/i);
});

test('theme exports native splash constant aligned with light background', async () => {
  const theme = await readText('apps/web/src/lib/theme.ts');

  assert.match(theme, /export const NATIVE_SPLASH_BACKGROUND = '#f7f5f2'/);
  assert.match(theme, /light: NATIVE_SPLASH_BACKGROUND/);
});
