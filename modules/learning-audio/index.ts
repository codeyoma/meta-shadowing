import { requireOptionalNativeModule } from 'expo';
import type { MonitorStatus } from '../../src/core/voice-monitor-lab';
import type { LessonRemoteEvent } from '../../src/core/lesson-remote';

interface LearningAudio {
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
