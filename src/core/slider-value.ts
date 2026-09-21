type SliderRange = { min: number; max: number; step: number };

export function sliderValue(value: number, { min, max, step }: SliderRange): number {
  return Number(Math.max(min, Math.min(max, min + Math.round((value - min) / step) * step)).toFixed(8));
}

export function sliderReleaseValue(displayed: number | null, released: number, range: SliderRange): number {
  return sliderValue(displayed ?? released, range);
}
