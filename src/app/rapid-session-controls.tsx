"use client";

import { isWpmLevel, RAPID_WPM, type RapidSettings } from "@/lib/rapid-session";

function DelayControl({ label, value, onChange }: { label: string; value: number; onChange: (milliseconds: number) => void }) {
  return <label className="audio-setting">{label}
    <input type="number" min={0} max={30} step={0.5} value={value / 1000} onChange={event => {
      if (event.target.validity.valid && event.target.value !== "") onChange(Number(event.target.value) * 1000);
    }} />
  </label>;
}

export function RapidSessionControls({ level, settings, onChange }: { level: number; settings: RapidSettings; onChange: (settings: Partial<RapidSettings>) => void }) {
  return <div className="audio-session-controls rapid-session-controls">
    <div className="segment-control" aria-label="학습 방식">
      <button type="button" className={settings.mode === "manual" ? "selected" : ""} aria-pressed={settings.mode === "manual"} onClick={() => onChange({ mode: "manual" })}>수동</button>
      <button type="button" className={settings.mode === "automatic" ? "selected" : ""} aria-pressed={settings.mode === "automatic"} onClick={() => onChange({ mode: "automatic" })}>자동</button>
    </div>
    <label className="audio-setting">단어 속도
      <select value={settings.wpmLevel} onChange={event => {
        const wpmLevel = Number(event.target.value);
        if (isWpmLevel(wpmLevel)) onChange({ wpmLevel });
      }}>
        {([3, 4, 5, 6] as const).map(value => <option key={value} value={value}>{value} · {RAPID_WPM[value]} WPM</option>)}
      </select>
    </label>
    <div className="segment-control" aria-label="표시 방식">
      <button type="button" className={settings.display === "current" ? "selected" : ""} aria-pressed={settings.display === "current"} onClick={() => onChange({ display: "current" })}>현재 단어</button>
      <button type="button" className={settings.display === "cumulative" ? "selected" : ""} aria-pressed={settings.display === "cumulative"} onClick={() => onChange({ display: "cumulative" })}>누적 단어</button>
    </div>
    {level >= 7 ? <DelayControl label="말하기 추가 시간 (초)" value={settings.speakingExtraMs} onChange={speakingExtraMs => onChange({ speakingExtraMs })} /> : null}
    {settings.mode === "automatic" ? <>
      <DelayControl label="문장 간격 (초)" value={settings.lineGapMs} onChange={lineGapMs => onChange({ lineGapMs })} />
      <DelayControl label="구간 간격 (초)" value={settings.sectionGapMs} onChange={sectionGapMs => onChange({ sectionGapMs })} />
    </> : null}
    <p className="rapid-settings-help">{level >= 7 ? "말하기 시간(초) = 목표어 단어 수 × 60 ÷ WPM + 추가 시간. " : ""}{settings.mode === "automatic" ? "챕터·빈 줄 경계에는 문장 간격 대신 구간 간격을 적용합니다." : "한 문장을 모두 재생한 뒤 다음 입력을 기다립니다."}</p>
  </div>;
}
