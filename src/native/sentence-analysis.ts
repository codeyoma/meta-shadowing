import delivery from '../../modules/package-delivery';
import { packageKeyOf, type LearningPackage } from '@/core/learning-context';
import { mayUsePackage } from './paid-package';

export async function readInstalledSyntax(pack: LearningPackage): Promise<string | null> {
  if (!mayUsePackage(pack)) return null;
  const raw = await delivery.sentenceSyntax?.(packageKeyOf(pack));
  return mayUsePackage(pack) ? raw ?? null : null;
}
