import { Host, Picker, Text } from '@expo/ui/swift-ui';
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

/** SwiftUI owns selection feedback and accessibility; never wrap in FeedbackPressable. */
export function SystemPicker<T extends string | number>({ label, value, options, onChange, menu = false }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
  menu?: boolean;
}) {
  return <Host matchContents={{ vertical: true }} style={{ width: '100%', minHeight: 44 }}>
    <Picker label={label} selection={value} modifiers={[pickerStyle(menu ? 'menu' : 'segmented')]}
      onSelectionChange={(next: T) => {
        if (next !== value && options.some(option => option.value === next)) onChange(next);
      }}>
      {options.map(option => <Text key={option.value} modifiers={[tag(option.value)]}>{option.label}</Text>)}
    </Picker>
  </Host>;
}
