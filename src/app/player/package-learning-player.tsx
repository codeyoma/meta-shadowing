"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { readLessonPackage, type InstalledLessonPackage } from "@/lib/lesson-package-store";
import { LessonPackagesProvider, PackageDownloads, useLessonPackages } from "../lesson-packages-provider";
import { CloudLearningPlayer } from "./cloud-learning-player";
import { PackageContent } from "./package-content";
import { DeviceAccessProvider } from "../device-access-provider";
import { LocalLearningPlayer } from "./local-learning-player";

type Props = ComponentProps<typeof CloudLearningPlayer>;
export function PackageLearningPlayer(props: Props) {
  const player = <LessonPackagesProvider accountId={props.accountId} catalog={[props.lesson]}><PackageGate {...props} /></LessonPackagesProvider>;
  return props.level === 1 ? <DeviceAccessProvider accountId={props.accountId}>{player}</DeviceAccessProvider> : player;
}
function PackageGate(props: Props) {
  const packages = useLessonPackages()!;
  const [snapshot, setSnapshot] = useState<{ accountId: string; value: InstalledLessonPackage } | null>(null);
  const installed = snapshot?.accountId === props.accountId ? snapshot.value : null;
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true;
    if (packages.invalid) { setSnapshot(null); return; }
    void readLessonPackage(props.accountId, props.lesson.id, props.lesson.version).then(value => {
      if (active) {
        // A fresh byte-verified read must not recreate equivalent media providers.
        setSnapshot(previous => value ? previous?.accountId === props.accountId && previous.value.sha256 === value.sha256
          ? previous : { accountId: props.accountId, value } : null);
        setChecked(true);
      }
    }).catch(() => { if (active) { setSnapshot(null); setChecked(true); } });
    return () => { active = false; };
  }, [props.accountId, props.lesson.id, props.lesson.version, packages.revision, packages.invalid]);
  if (installed && !packages.invalid) return <PackageContent.Provider value={installed}>
    {props.level === 1 ? <LocalLearningPlayer lesson={installed.manifest.lesson} stage={props.stage} requestedRun={props.requestedRun} />
      : <CloudLearningPlayer {...props} lesson={installed.manifest.lesson} hints={installed.manifest.hints} lines={installed.manifest.lines} />}
  </PackageContent.Provider>;
  return <main className="page mx-auto flex w-full max-w-md flex-col gap-4 overflow-y-auto p-5">
    <h1>{props.lesson.name}</h1>
    <p role="status">{packages.invalid ? "계정 인증이 필요합니다. 다시 로그인해 주세요." : checked ? "이 레슨 전체를 다운로드해 주세요." : "기기에 저장된 레슨을 확인하고 있어요…"}</p>
    <PackageDownloads />
    <Button asChild variant="outline"><a href={`/lessons/${props.lesson.id}/stages`}>스테이지로 돌아가기</a></Button>
  </main>;
}
