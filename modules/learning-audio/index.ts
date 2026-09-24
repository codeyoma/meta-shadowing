import { requireOptionalNativeModule } from 'expo';
import type { MonitorStatus } from '../../src/core/voice-monitor-lab';
import type { LessonRemoteEvent } from '../../src/core/lesson-remote';
import type { VideoStatus } from '../../src/core/video-playback';

interface LearningAudio {
  readonly localVideoManifest?: string | null;
  readonly localVideoManifestInvalid?: boolean;
  videoPackageStatus(): Promise<{ installed: boolean; bytes: number }>;
  installVideoPackage(): Promise<void>;
  removeVideoPackage(): Promise<void>;
  videoPrepare(owner: string, generation: number, sourceIndices: number[], position: number, rate: number): Promise<void>;
  videoPlay(owner: string, generation: number): Promise<void>;
  videoPause(owner: string): Promise<void>;
  videoDispose(owner: string): Promise<void>;
  addListener(name: 'onVideoStatus', listener: (status: VideoStatus) => void): { remove(): void };
  durations(uris: string[]): Promise<number[]>;
  testStageAccess(): Promise<boolean>;
  monitorStatus(): Promise<MonitorStatus>;
  enableMonitor(): Promise<MonitorStatus>;
  disableMonitor(): Promise<void>;
  configureLearningPlayback(): Promise<void>;
  setMonitorGain(value: number): Promise<void>;
  playMonitorSample(uri: string): Promise<void>;
  stopMonitorSample(): Promise<void>;
  beginLessonRemote(owner: string): Promise<void>;
  activateLessonRemote(owner: string): Promise<void>;
  updateLessonRemote(owner: string, revision: string, actionable: boolean, playing: boolean): Promise<void>;
  updateLessonRemoteActions?(owner: string, revision: string, actionable: boolean, repeatable: boolean, playing: boolean): Promise<void>;
  endLessonRemote(owner: string): Promise<void>;
  addListener(name: 'onLessonRemotePress', listener: (event: LessonRemoteEvent) => void): { remove(): void };
  addListener(name: 'onMonitorStatus', listener: (status: MonitorStatus) => void): { remove(): void };
}
export default requireOptionalNativeModule<LearningAudio>('LearningAudio');
