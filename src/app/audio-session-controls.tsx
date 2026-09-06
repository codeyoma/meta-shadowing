"use client";

import { PLAYBACK_RATES, type AudioSessionSettings } from "@/lib/audio-session";

export function AudioSessionControls({ settings, onChange }: {
  settings: AudioSessionSettings;
  onChange: (settings: Partial<AudioSessionSettings>) => void;
}) {
  return (
    <div className="audio-session-controls">
      <div className="segment-control" aria-label="학습 방식">
        <button type="button" className={settings.mode === "manual" ? "selected" : ""} aria-pressed={settings.mode === "manual"} onClick={() => onChange({ mode: "manual" })}>수동</button>
        <button type="button" className={settings.mode === "automatic" ? "selected" : ""} aria-pressed={settings.mode === "automatic"} onClick={() => onChange({ mode: "automatic" })}>자동</button>
      </div>
      <label className="audio-setting">원음 속도
        <select value={settings.playbackRate} onChange={(event) => onChange({ playbackRate: Number(event.target.value) })}>
          {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
      </label>
      {settings.mode === "automatic" ? <label className="audio-setting">다음 이동 대기 (초)
        <input type="number" min={0} max={30} step={0.5} value={settings.advanceDelayMs / 1000} onChange={(event) => {
          if (event.target.validity.valid) onChange({ advanceDelayMs: Number(event.target.value) * 1000 });
        }} />
      </label> : null}
    </div>
  );
}
