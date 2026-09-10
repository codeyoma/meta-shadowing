"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Drawer, DrawerClose, DrawerDescription, DrawerHeader, DrawerTitle, DrawerViewportContent } from "@/components/ui/drawer";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { readDeviceLearningRecord, writeDeviceLearningSettings } from "@/lib/device-learning-store";
import { DEFAULT_SESSION_SETTINGS, resolveSessionSettings, type SessionSettings } from "@/lib/session-settings";
import { isGroupSize } from "@/lib/phrase-groups";
import { levelNames } from "@/lib/lessons";
import { AudioSessionControls } from "./audio-session-controls";
import { RapidSessionControls } from "./rapid-session-controls";
import { LearnerSignOut } from "./learner-sign-out";
import { PackageDownloads, useLessonPackages } from "./lesson-packages-provider";
import { useDeviceAccess } from "./device-access-provider";

export const DEVICE_SETTINGS_EXTENSION_POINTS = ["packages", "manual-transfer", "local-recovery"] as const;

type DeviceSettingsContext = { openSettings: (trigger?: HTMLElement) => void; invalidateAccount: () => void };
const Context = createContext<DeviceSettingsContext | null>(null);

export function useDeviceSettings() {
  const value = useContext(Context);
  if (!value) throw new Error("Device settings require DeviceSettingsProvider");
  return value;
}

export function DeviceSettingsProvider({ accountId, profile, children }: {
  accountId: string;
  profile: { name: string; image: string | null };
  children: ReactNode;
}) {
  const packages = useLessonPackages();
  const access = useDeviceAccess();
  const invalidatePackages = packages?.invalidate;
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SESSION_SETTINGS);
  const [level, setLevel] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [identityInvalid, setIdentityInvalid] = useState(false);
  const identityInvalidRef = useRef(false);
  const generation = useRef(0);
  const writeQueue = useRef(Promise.resolve());

  const load = useCallback(() => {
    if (identityInvalidRef.current) return Promise.resolve();
    const token = ++generation.current;
    setStatus("loading");
    return readDeviceLearningRecord(accountId).then(record => {
      if (token !== generation.current) return;
      setSettings(resolveSessionSettings(record?.settings));
      setLevel(record?.preferredLevel ?? 1);
      setStatus("ready");
    }).catch(() => {
      if (token === generation.current) setStatus("error");
    });
  }, [accountId]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const persist = useCallback((nextSettings: SessionSettings, nextLevel: number) => {
    if (identityInvalidRef.current || status === "loading" || status === "error") return;
    setStatus("saving");
    const token = generation.current;
    writeQueue.current = writeQueue.current.then(async () => {
      if (token !== generation.current || identityInvalidRef.current) return;
      await writeDeviceLearningSettings(accountId, nextLevel, nextSettings, access ?? undefined);
      if (token === generation.current) {
        setSettings(nextSettings);
        setLevel(nextLevel);
        setStatus("saved");
      }
    }).catch(() => {
      if (token === generation.current) setStatus("error");
    });
  }, [accountId, status, access]);
  const change = useCallback((changes: Partial<SessionSettings>) => {
    persist(resolveSessionSettings(changes, settings), level);
  }, [level, persist, settings]);

  const openSettings = useCallback(() => {
    if (!identityInvalidRef.current) setOpen(true);
  }, []);
  const invalidateAccount = useCallback(() => {
    invalidatePackages?.();
    identityInvalidRef.current = true;
    generation.current += 1;
    setSettings(DEFAULT_SESSION_SETTINGS);
    setLevel(1);
    setStatus("error");
    setIdentityInvalid(true);
    setOpen(false);
  }, [invalidatePackages]);
  return <Context.Provider value={{ openSettings, invalidateAccount }}>
    <Drawer open={!identityInvalid && open} onOpenChange={nextOpen => setOpen(identityInvalidRef.current ? false : nextOpen)} direction="right" autoFocus>
      {children}
      <DrawerViewportContent aria-describedby="device-settings-description" footer={<DrawerClose asChild><Button variant="outline">닫기</Button></DrawerClose>}>
        <DrawerHeader>
          <DrawerTitle>설정</DrawerTitle>
          <DrawerDescription id="device-settings-description">{profile.name} 계정의 학습 설정을 이 기기에만 저장합니다.</DrawerDescription>
          <div className="flex min-w-0 items-center gap-2 pt-2" aria-label="Google 계정">
            <Avatar><AvatarImage src={profile.image ?? undefined} alt="" referrerPolicy="no-referrer" /><AvatarFallback>{Array.from(profile.name)[0]}</AvatarFallback></Avatar>
            <span className="truncate" title={profile.name}>{profile.name}</span>
          </div>
        </DrawerHeader>
        <div className="min-h-0 overflow-y-auto">
          {status === "error" ? <Alert role="alert"><AlertTitle>기기 설정을 읽거나 저장하지 못했습니다.</AlertTitle><AlertDescription>브라우저 저장 공간을 확인해 주세요. 변경 사항을 저장했다고 처리하지 않았습니다.</AlertDescription><Button variant="outline" onClick={() => void load()}>다시 시도</Button></Alert> : null}
          <FieldSet disabled={status === "loading" || status === "saving" || status === "error"} aria-busy={status === "loading" || status === "saving"}>
            <FieldGroup>
              <Field><FieldLabel htmlFor="device-preferences-level">학습 레벨</FieldLabel>
                <NativeSelect id="device-preferences-level" value={level} onChange={event => persist(settings, Number(event.target.value))}>
                  {levelNames.map((name, index) => <NativeSelectOption key={name} value={index + 1}>Lv {index + 1} · {name}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              {level === 4 || level === 5 ? <Field><FieldLabel htmlFor="device-preferences-group-size">묶음 크기</FieldLabel>
                <NativeSelect id="device-preferences-group-size" value={settings.groupSize} onChange={event => {
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
          <p className="mt-4 text-sm text-muted-foreground">레벨 1은 기기 설정을 사용합니다. 나머지 레벨은 전환 작업이 끝날 때까지 기존 계정 설정을 사용합니다.</p>
          <PackageDownloads />
          <div className="mt-6"><LearnerSignOut settingsRow /></div>
        </div>
      </DrawerViewportContent>
    </Drawer>
  </Context.Provider>;
}
