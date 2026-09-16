import { Redirect } from 'expo-router';
import { animationPreviewEnabled } from '../../modules/package-delivery';
import { DownloadPreview } from '@/components/download-preview';

export default function DownloadPreviewRoute() {
  // Guard deep links too; hiding the library button alone is insufficient.
  return animationPreviewEnabled ? <DownloadPreview /> : <Redirect href="/" />;
}
