"use client";

import type { ReactNode } from "react";
import {
  BookOpen, Check, ChevronLeft, ChevronRight, Menu, Pause, Play, RotateCcw,
  Settings, Subtitles, Volume2, X, type LucideProps
} from "lucide-react";
import { cn } from "@/lib/utils";

export function MarkIcon({ className }: { className?: string }) {
  return <svg aria-hidden="true" className={className} viewBox="0 0 36 36" fill="none">
    <path d="M5 28V10c0-3 4-5 6-2l7 8 7-8c2-3 6-1 6 2v18" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function ArrowIcon(props: LucideProps) { return <ChevronRight aria-hidden="true" data-icon="inline-end" {...props} />; }
export function BackIcon(props: LucideProps) { return <ChevronLeft aria-hidden="true" data-icon="inline-start" {...props} />; }
export function MenuIcon(props: LucideProps) { return <Menu aria-hidden="true" {...props} />; }
export function CloseIcon(props: LucideProps) { return <X aria-hidden="true" {...props} />; }
export function CheckIcon(props: LucideProps) { return <Check aria-hidden="true" {...props} />; }
export function GearIcon(props: LucideProps) { return <Settings aria-hidden="true" data-icon="inline-start" {...props} />; }
export function PauseIcon(props: LucideProps) { return <Pause aria-hidden="true" data-icon="inline-start" {...props} />; }
export function PlayIcon(props: LucideProps) { return <Play aria-hidden="true" data-icon="inline-start" {...props} />; }
export function SubtitleIcon(props: LucideProps) { return <Subtitles aria-hidden="true" data-icon="inline-start" {...props} />; }
export function SpeakerIcon(props: LucideProps) { return <Volume2 aria-hidden="true" {...props} />; }
export function RepeatIcon(props: LucideProps) { return <RotateCcw aria-hidden="true" data-icon="inline-start" {...props} />; }
export function LessonIcon(props: LucideProps) { return <BookOpen aria-hidden="true" data-icon="inline-start" {...props} />; }

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={cn("brand", compact && "brand-compact")}><MarkIcon /><span>Meta Shadowing</span></div>;
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("page", className)}>{children}</main>;
}
