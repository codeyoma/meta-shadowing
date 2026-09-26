import { useLocalSearchParams } from 'expo-router';
import { PlayerAnalysis } from '@/components/player-analysis';
import { LearningGuide } from '@/components/learning-guide';

export default function PlayerInfo() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  return kind === 'analysis' ? <PlayerAnalysis /> : <LearningGuide />;
}
