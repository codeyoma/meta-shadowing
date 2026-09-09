"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { levelNames } from "@/lib/lessons";
import { isGroupSize } from "@/lib/phrase-groups";
import { resolveSessionSettings, type SessionSettings } from "@/lib/session-settings";
import { browseHref, stageHref } from "@/lib/browse-navigation";
import { useBrowse } from "./browse-shell";
import { BrowsePageContent } from "./browse-pages";
import { AudioSessionControls } from "./audio-session-controls";
import { RapidSessionControls } from "./rapid-session-controls";
import { useCloudPreferences } from "./cloud-preferences-provider";

export function SessionPreferencesPage({ defaults }: { defaults: SessionSettings }) {
  const { selection } = useBrowse();
  const cloud = useCloudPreferences()!;
  const query = useSearchParams();
  const requestedLevel = Number(query.get("level"));
  const [level, setLevel] = useState(Number.isInteger(requestedLevel) && requestedLevel >= 1 && requestedLevel <= 8 ? requestedLevel : 1);
  const settings = resolveSessionSettings(cloud.profile.overrides, cloud.defaults);
  const ready = !cloud.saving;
  function change(changes: Partial<SessionSettings>) { cloud.save(changes); }
  const stage = Number(query.get("stage"));
  const fromStage = selection.lessonId && Number.isInteger(stage) && stage >= 1 && stage <= 16;
  const back = fromStage ? stageHref(selection.lessonId!, stage) : browseHref("settings", selection);
  return <BrowsePageContent title="세션 설정" region="세션 설정 항목" before={<Button asChild variant="ghost" size="icon">
    <Link href={back} scroll={false} aria-label={fromStage ? "스테이지로 돌아가기" : "설정 목록으로 돌아가기"}><ArrowLeft aria-hidden="true" /></Link>
  </Button>}>
    <FieldSet disabled={!ready} aria-busy={!ready}>
    <FieldGroup>
      <Field><FieldLabel htmlFor="preferences-level">학습 레벨</FieldLabel>
        <NativeSelect id="preferences-level" value={level} disabled={!ready} onChange={event => setLevel(Number(event.target.value))}>
          {levelNames.map((name, index) => <NativeSelectOption key={name} value={index + 1}>Lv {index + 1} · {name}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      {level === 4 || level === 5 ? <Field><FieldLabel htmlFor="preferences-group-size">묶음 크기</FieldLabel>
        <NativeSelect id="preferences-group-size" value={settings.groupSize} onChange={event => {
          const value = Number(event.target.value); if (isGroupSize(value)) change({ groupSize: value });
        }}>
          {[2, 3, 4].map(size => <NativeSelectOption key={size} value={size}>{size}개</NativeSelectOption>)}
        </NativeSelect>
      </Field> : null}
      {level >= 6 ? <RapidSessionControls level={level} settings={settings} onChange={change} />
        : <AudioSessionControls level={level} settings={{ ...settings, playbackRate: settings.speed }} onChange={changes => {
          const { playbackRate, ...rest } = changes;
          change({ ...rest, ...(playbackRate !== undefined ? { speed: playbackRate } : {}) });
        }} />}
    </FieldGroup>
    </FieldSet>
  </BrowsePageContent>;
}
