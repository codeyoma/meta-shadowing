// Owner-approved role swaps: Primary ↔ Bee; Primary Pressed ↔ Fox.
export const brandColors = {
  primary: '#ffc800', primaryPressed: '#ff9600', bee: '#58cc02', fox: '#58a700',
};
const light = {
  background: '#ffffff', card: '#ffffff', soft: '#f7f7f7', text: '#3c3c3c',
  heading: '#042c60', secondary: '#4b4b4b', line: '#e5e5e5', outline: '#afafaf',
  accent: brandColors.primary, accentPressed: brandColors.primaryPressed, onAccent: '#042c60',
  selection: '#d7ffb8', blue: '#1cb0f6', blueSoft: '#e4f5fd', link: '#042c60',
  bee: brandColors.bee, fox: brandColors.fox, red: '#ff4b4b', danger: '#ac3026', disabled: '#e5e5e5',
};

export type Palette = { [Key in keyof typeof light]: string };

export const palettes: Record<'light' | 'dark', Palette> = {
  light,
  dark: {
    background: '#101c2c', card: '#192a3e', soft: '#20334a', text: '#f4f7fa',
    heading: '#f4f7fa', secondary: '#b8c7d8', line: '#344960', outline: '#7890ab',
    accent: brandColors.primary, accentPressed: brandColors.primaryPressed, onAccent: '#042c60',
    selection: '#254b34', blue: '#1cb0f6', blueSoft: '#143953', link: '#8dd8ff',
    bee: brandColors.bee, fox: brandColors.fox, red: '#ff4b4b', danger: '#ffb4a9', disabled: '#344960',
  },
};
