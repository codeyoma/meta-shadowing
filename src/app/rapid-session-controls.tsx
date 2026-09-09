"use client";

import { useId } from "react";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isWpmLevel, RAPID_WPM, type RapidSettings } from "@/lib/rapid-session";

function DelayControl({ label, value, onChange, disabled = false }: { disabled?: boolean; label: string; value: number; onChange: (milliseconds: number) => void }) {
  const id = useId();
  return <Field>
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Input disabled={disabled} id={id} type="number" min={0} max={30} step={0.5} value={value / 1000} onChange={event => {
      if (event.target.validity.valid && event.target.value !== "") onChange(Number(event.target.value) * 1000);
    }} />
  </Field>;
}

export function RapidSessionControls({ level, settings, onChange, disabled = false }: { disabled?: boolean; level: number; settings: RapidSettings; onChange: (settings: Partial<RapidSettings>) => void }) {
  const id = useId();
  return <FieldGroup>
    <Field>
      <FieldTitle id={`${id}-mode-label`}>학습 방식</FieldTitle>
      <ToggleGroup disabled={disabled} type="single" variant="outline" value={settings.mode} aria-labelledby={`${id}-mode-label`} onValueChange={mode => {
        if (mode === "manual" || mode === "automatic") onChange({ mode });
      }}>
        <ToggleGroupItem value="manual">수동</ToggleGroupItem>
        <ToggleGroupItem value="automatic">자동</ToggleGroupItem>
      </ToggleGroup>
    </Field>
    <Field>
      <FieldLabel htmlFor={`${id}-speed`}>단어 속도</FieldLabel>
      <NativeSelect disabled={disabled} id={`${id}-speed`} value={settings.wpmLevel} onChange={event => {
        const wpmLevel = Number(event.target.value);
        if (isWpmLevel(wpmLevel)) onChange({ wpmLevel });
      }}>
        {([3, 4, 5, 6] as const).map(value => <NativeSelectOption key={value} value={value}>{value} · {RAPID_WPM[value]} WPM</NativeSelectOption>)}
      </NativeSelect>
    </Field>
    <Field>
      <FieldTitle id={`${id}-display-label`}>표시 방식</FieldTitle>
      <ToggleGroup disabled={disabled} type="single" variant="outline" value={settings.display} aria-labelledby={`${id}-display-label`} onValueChange={display => {
        if (display === "current" || display === "cumulative") onChange({ display });
      }}>
        <ToggleGroupItem value="current">현재 단어</ToggleGroupItem>
        <ToggleGroupItem value="cumulative">누적 단어</ToggleGroupItem>
      </ToggleGroup>
    </Field>
    {level >= 7 ? <DelayControl disabled={disabled} label="말하기 추가 시간 (초)" value={settings.speakingExtraMs} onChange={speakingExtraMs => onChange({ speakingExtraMs })} /> : null}
    {settings.mode === "automatic" ? <>
      <DelayControl disabled={disabled} label="문장 간격 (초)" value={settings.lineGapMs} onChange={lineGapMs => onChange({ lineGapMs })} />
      <DelayControl disabled={disabled} label="구간 간격 (초)" value={settings.sectionGapMs} onChange={sectionGapMs => onChange({ sectionGapMs })} />
    </> : null}
    <FieldDescription>{level >= 7 ? "말하기 시간(초) = 목표어 단어 수 × 60 ÷ WPM + 추가 시간. " : ""}{settings.mode === "automatic" ? "챕터·빈 줄 경계에는 문장 간격 대신 구간 간격을 적용합니다." : "한 문장을 모두 재생한 뒤 다음 입력을 기다립니다."}</FieldDescription>
  </FieldGroup>;
}
