"use client";

import { useId } from "react";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PLAYBACK_RATES, type AudioSessionSettings } from "@/lib/audio-session";

export function AudioSessionControls({ settings, onChange, level = 1, disabled = false }: {
  disabled?: boolean;
  level?: number;
  settings: AudioSessionSettings;
  onChange: (settings: Partial<AudioSessionSettings>) => void;
}) {
  const id = useId();
  return (
    <FieldGroup>
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
        <FieldLabel htmlFor={`${id}-speed`}>재생속도</FieldLabel>
        <NativeSelect disabled={disabled} id={`${id}-speed`} value={settings.playbackRate} onChange={event => onChange({ playbackRate: Number(event.target.value) })}>
          {PLAYBACK_RATES.map(rate => <NativeSelectOption key={rate} value={rate}>{rate}×</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      {settings.mode === "automatic" ? <Field>
        <FieldLabel htmlFor={`${id}-advance`}>다음 이동 대기 (초)</FieldLabel>
        <Input disabled={disabled} id={`${id}-advance`} type="number" min={0} max={30} step={0.5} value={settings.advanceDelayMs / 1000} onChange={event => {
          if (event.target.validity.valid && event.target.value !== "") onChange({ advanceDelayMs: Number(event.target.value) * 1000 });
        }} />
      </Field> : null}
      {level === 4 || level === 5 ? <Field>
        <FieldLabel htmlFor={`${id}-group-gap`}>묶음 원음 간격 (초)</FieldLabel>
        <Input disabled={disabled} id={`${id}-group-gap`} type="number" min={0} max={30} step={0.5} value={(settings.groupGapMs ?? 500) / 1000} onChange={event => {
          if (event.target.validity.valid && event.target.value !== "") onChange({ groupGapMs: Number(event.target.value) * 1000 });
        }} />
      </Field> : null}
    </FieldGroup>
  );
}
