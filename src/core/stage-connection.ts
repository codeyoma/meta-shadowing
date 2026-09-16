export function stageConnectionPoints(width: number, from: number, to: number, height: number): { x: number; y: number }[] {
  if (![width, from, to, height].every(Number.isFinite) || width <= 0 || height <= 0) return [];
  const direction = to >= from ? 1 : -1;
  const inset = Math.min(8, width / 2);
  const clamp = (x: number) => Math.max(inset, Math.min(width - inset, x));
  // Exit sideways around the current coin's captions, then turn back into the
  // next coin. Horizontal end tangents give the connector its soft S shape.
  const first = clamp(from + direction * width * 0.72);
  const second = clamp(to - direction * width * 0.2);
  const samples = [{ x: from, y: 0, distance: 0 }];
  for (let step = 1; step <= 128; step++) {
    const t = step / 128, u = 1 - t;
    const x = u ** 3 * from + 3 * u * u * t * first + 3 * u * t * t * second + t ** 3 * to;
    const y = (3 * u * t * t + t ** 3) * height;
    const previous = samples[step - 1]!;
    samples.push({ x, y, distance: previous.distance + Math.hypot(x - previous.x, y - previous.y) });
  }
  const total = samples.at(-1)!.distance;
  const intervals = Math.ceil(total / 16);
  let cursor = 1;
  return Array.from({ length: intervals + 1 }, (_, index) => {
    const distance = total * index / intervals;
    while (cursor < samples.length - 1 && samples[cursor]!.distance < distance) cursor++;
    const a = samples[cursor - 1]!, b = samples[cursor]!;
    const fraction = (distance - a.distance) / (b.distance - a.distance);
    return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction };
  });
}
