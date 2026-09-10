"use client";

import { useEffect } from "react";
import { useDeviceSettings } from "./device-settings-provider";

export function SettingsRouteOpener() {
  const { openSettings } = useDeviceSettings();
  useEffect(() => { openSettings(); }, [openSettings]);
  return <p className="sr-only">기기 설정을 여는 중…</p>;
}
