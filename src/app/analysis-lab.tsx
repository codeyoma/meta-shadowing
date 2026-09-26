import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { animationPreviewEnabled } from '../../modules/package-delivery';
import { AnalysisBrowser } from '@/components/analysis-browser';
import { Label } from '@/components/ui';
import { readSentenceAnalysis } from '@/core/sentence-analysis';
import { syntaxFixture, syntaxPhrases } from '@/test-support/syntax-fixture';

/** Public synthetic content only; never bypasses access to an installed book. */
export default function AnalysisLab() {
  if (!animationPreviewEnabled) return <ScrollView contentInsetAdjustmentBehavior="automatic"><Label>개발 빌드에서만 사용할 수 있어요.</Label></ScrollView>;
  return <AnalysisBrowser sentences={readSentenceAnalysis(JSON.stringify(syntaxFixture()), syntaxPhrases, 'en', [0])}
    onClose={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} />;
}
