import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palettes } from '../components/theme';

// WCAG relative luminance, independent of the app's palette selection.
function luminance(hex: string) {
  const rgb = hex.slice(1).match(/.{2}/g)!.map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

test('learning text and labeled controls remain readable in both appearances', () => {
  for (const [appearance, p] of Object.entries(palettes)) {
    const pairs = [
      ['body', p.text, p.background], ['secondary', p.secondary, p.background],
      ['card', p.text, p.card], ['heading', p.heading, p.background],
      ['primary button', p.onAccent, p.accent], ['selected option', p.heading, p.selection],
      ['secondary button', p.link, p.card], ['destructive action', p.danger, p.background],
    ];
    for (const [role, ink, surface] of pairs) {
      const a = luminance(ink!), b = luminance(surface!);
      const contrast = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      assert.ok(contrast >= 4.5, `${appearance} ${role}: ${contrast.toFixed(2)}:1 is below 4.5:1`);
    }
  }
});
