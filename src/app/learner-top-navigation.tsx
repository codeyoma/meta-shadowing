"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { readLearningJournal } from "@/lib/learning-records";
import { studyStreak } from "@/lib/study-streak";
import { cn } from "@/lib/utils";
import { Brand } from "./ui";
import styles from "./learner.module.css";

export function LearnerTopNavigation({ className }: { className?: string }) {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    const refresh = () => setStreak(studyStreak(readLearningJournal().studyDays));
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return <header className={cn(styles.homeHeader, className)}>
    <nav className={styles.homeNav} aria-label="상단 탐색">
      <Brand compact />
      <Badge variant="streak" aria-label={`${streak}일 연속 학습`} title="하루 한 번 이상 학습한 연속 일수">
        <span className={styles.streakFlame} aria-hidden="true">
          <Flame className={styles.streakFlameOuter} fill="currentColor" />
          <Flame className={styles.streakFlameInner} fill="currentColor" />
        </span>
        {streak}
      </Badge>
    </nav>
    <Separator />
  </header>;
}
