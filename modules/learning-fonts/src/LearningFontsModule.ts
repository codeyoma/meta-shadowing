import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class LearningFontsModule extends NativeModule<{}> {
  availableFonts(): string[];
}

export default requireOptionalNativeModule<LearningFontsModule>('LearningFonts');
