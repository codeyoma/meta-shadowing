"use client";

import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { studyStreak } from "@/lib/study-streak";
import { cn } from "@/lib/utils";
import { Brand } from "./ui";
import styles from "./learner.module.css";
import { useDeviceJournal } from "./use-device-journal";

export function LearnerTopNavigation({ className }: { className?: string }) {
  const device = useDeviceJournal();
  const visibleStreak = studyStreak(device.journal.studyDays);

  return <header className={cn(styles.homeHeader, className)}>
    <nav className={styles.homeNav} aria-label="상단 탐색">
      <Brand compact />
      {!device.loading ? <Badge variant="streak" aria-label={`${visibleStreak}일 연속 학습`} title="하루 한 번 이상 학습한 연속 일수">
        <span className={styles.streakFlame} aria-hidden="true">
          <Flame className={styles.streakFlameOuter} fill="currentColor" />
          <Flame className={styles.streakFlameInner} fill="currentColor" />
        </span>
        {visibleStreak}
      </Badge> : null}
    </nav>
    <Separator />
  </header>;
}
