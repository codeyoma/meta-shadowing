"use client";
import { createContext, useContext } from "react";
import type { InstalledLessonPackage } from "@/lib/lesson-package-store";
export const PackageContent = createContext<InstalledLessonPackage | null>(null);
export const usePackageContent = () => useContext(PackageContent);
