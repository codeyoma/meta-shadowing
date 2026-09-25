import React from 'react';

// Native popup rendering is verified in the simulator; this exposes its public
// actions and accessibility labels to the production-component test harness.
function accessibility(props: any) {
  return { accessibilityLabel: props.modifiers?.find((item: any) => item.$type === 'accessibilityLabel')?.label };
}
export const nativeFontMenu = {
  Host: 'Host', HStack: 'HStack', Text: 'Text', Image: 'Image', Spacer: 'Spacer',
  Menu: (props: any) => React.createElement('NativeMenu', { ...props, ...accessibility(props) }, props.label, props.children),
  Button: (props: any) => React.createElement('NativeMenuItem', { ...props, ...accessibility(props) }),
};
export const nativeFontMenuModifiers = {
  accessibilityLabel: (label: string) => ({ $type: 'accessibilityLabel', label }),
  accessibilityAddTraits: (traits: string[]) => ({ $type: 'accessibilityAddTraits', traits }),
  buttonStyle: (style: string) => ({ $type: 'buttonStyle', style }),
  font: (value: unknown) => ({ $type: 'font', value }),
  foregroundStyle: (value: unknown) => ({ $type: 'foregroundStyle', value }),
  frame: (value: unknown) => ({ $type: 'frame', value }),
  padding: (value: unknown) => ({ $type: 'padding', value }),
};
