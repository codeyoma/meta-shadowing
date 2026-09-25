import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import audio, { learningMonitorSupported } from '../../modules/learning-audio';
import { VoiceMonitorLab } from '../core/voice-monitor-lab';
import { audioUri, samplePackage } from './package';
import { installMaterials } from './package-availability';

let previous: VoiceMonitorLab | undefined;
let learning: { key: string; lab: VoiceMonitorLab } | undefined;

const playbackMode = () => setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false,
  allowsRecording: false, interruptionMode: 'doNotMix' });

export { learningMonitorSupported };

export function createLearningMonitor(key: string) {
  if (!learningMonitorSupported || !audio) throw Error('Learning monitoring is unavailable.');
  const prior = previous;
  const lab = new VoiceMonitorLab(audio, {
    async suspend() {
      await prior?.close();
      await audio!.disableMonitor();
      await playbackMode();
      await setIsAudioActiveAsync(true);
    },
    async restore() {
      await playbackMode();
      await setIsAudioActiveAsync(false);
    },
  }, true, 'player');
  learning = { key, lab };
  previous = lab;
  return lab;
}

export function learningMonitor(key: string | undefined) {
  return key && learning?.key === key && learning.lab.available ? learning.lab : undefined;
}

export async function configureLessonAudio(key?: string) {
  if (!learningMonitorSupported || !key) { await playbackMode(); return; }
  const current = learningMonitor(key);
  if (!current) throw Error('Learning audio session has ended.');
  await current.preparePlayback(() => audio!.configureLearningPlayback());
}

export function createMonitorLab() {
  if (!__DEV__ || !audio) throw Error('Monitoring development module is unavailable.');
  const prior = previous;
  learning = undefined;
  const lab = new VoiceMonitorLab(audio, {
    async suspend() {
      await prior?.close();
      await setIsAudioActiveAsync(false);
    },
    async restore() {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false,
        allowsRecording: false, interruptionMode: 'doNotMix' });
      await setIsAudioActiveAsync(true);
    },
  }, __DEV__);
  previous = lab;
  return lab;
}

export async function prepareMonitorSample() {
  if (!__DEV__) throw Error('Monitoring lab is development-only.');
  await installMaterials(samplePackage, () => {});
  return audioUri(samplePackage, 0);
}

export const monitorNative = audio;
