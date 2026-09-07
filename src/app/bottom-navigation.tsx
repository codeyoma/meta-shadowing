"use client";

import type { RefObject } from "react";
import Link from "next/link";
import { BookOpen, Languages, Map, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import styles from "./bottom-navigation.module.css";

const destinations = [
  { id: "languages", label: "언어", icon: Languages },
  { id: "lessons", label: "레슨", icon: BookOpen },
  { id: "stages", label: "스테이지", icon: Map },
  { id: "settings", label: "설정", icon: Settings },
] as const;
export type BrowseDestination = typeof destinations[number]["id"];

export function BottomNavigation({ active, onSelect, lessonAvailable = true, settingsRef, hrefs }: {
  active: BrowseDestination;
  onSelect?: (destination: BrowseDestination, button: HTMLButtonElement) => void;
  hrefs?: Record<BrowseDestination, string>;
  lessonAvailable?: boolean;
  settingsRef?: RefObject<HTMLButtonElement | null>;
}) {
  return <nav className={styles.navigation} aria-label="하단 탐색">
    <Separator />
    <div className={styles.items}>
      {destinations.map(({ id, label, icon: Icon }) => <Button key={id} asChild={!!hrefs} type={hrefs ? undefined : "button"} variant="navigation" size="navigation"
        ref={id === "settings" ? settingsRef : undefined} data-destination={id}
        aria-current={active === id ? "location" : undefined}
        disabled={!hrefs && !lessonAvailable && id === "stages"}
        title={!lessonAvailable && id === "stages" ? "선택한 언어에 게시된 레슨이 없습니다" : undefined}
        onClick={event => {
          const icon = event.currentTarget.querySelector<HTMLElement>("[data-nav-icon]");
          if (icon && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            for (const animation of icon.getAnimations()) animation.cancel();
            icon.animate([
              { transform: "translateY(0)", offset: 0 },
              { transform: "translateY(-5px)", offset: .4 },
              { transform: "translateY(1px)", offset: .75 },
              { transform: "translateY(0)", offset: 1 },
            ], { duration: 220, iterations: 1, easing: "cubic-bezier(.16, 1, .3, 1)" });
          }
          onSelect?.(id, event.currentTarget);
        }}>
        {hrefs ? <Link href={hrefs[id]} scroll={false}><span data-nav-icon className="grid"><Icon aria-hidden="true" data-icon="inline-start" /></span><span>{label}</span></Link>
          : <><span data-nav-icon className="grid"><Icon aria-hidden="true" data-icon="inline-start" /></span><span>{label}</span></>}
      </Button>)}
    </div>
  </nav>;
}
