"use client";

import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { studyStreak } from "@/lib/study-streak";
import { cn } from "@/lib/utils";
import { Brand } from "./ui";
import styles from "./learner.module.css";
import { useCloudPreferences } from "./cloud-preferences-provider";

export function LearnerTopNavigation({ className }: { className?: string }) {
  const account = useCloudPreferences();
  const accountDate = account ? new Date(new Intl.DateTimeFormat("en-CA", { timeZone: account.profile.studyTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()) + "T12:00:00") : null;
  const visibleStreak = account && accountDate ? studyStreak(account.journal.studyDays, accountDate) : 0;

  return <header className={cn(styles.homeHeader, className)}>
    <nav className={styles.homeNav} aria-label="상단 탐색">
      <Brand compact />
      {account && !account.loading ? <Badge variant="streak" aria-label={`${visibleStreak}일 연속 학습`} title="하루 한 번 이상 학습한 연속 일수">
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
