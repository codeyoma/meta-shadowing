// Owner-approved role swaps: Primary ↔ Bee; Primary Pressed ↔ Fox.
export const brandColors = {
  primary: '#ffc800', primaryPressed: '#ff9600', bee: '#58cc02', fox: '#58a700',
  primaryMint: '#a5ed6e', primarySoft: '#d7ffb8',
};
const light = {
  background: '#ffffff', card: '#ffffff', soft: '#f7f7f7', text: '#3c3c3c',
  heading: '#042c60', secondary: '#4b4b4b', line: '#e5e5e5', outline: '#afafaf',
  stageFill: '#ffffff',
  stageBadge: '#042c60', featuredCard: '#243541', featuredSecondary: '#b8c7d8', featuredTrack: '#465661',
  stageActionText: '#c75a00', stageActionEdge: 'rgba(255,255,255,0.5)',
  accent: brandColors.primary, accentPressed: brandColors.primaryPressed, onAccent: '#042c60',
  selection: '#d7ffb8', blue: '#1cb0f6', blueSoft: '#e4f5fd', link: '#042c60',
  bee: brandColors.bee, fox: brandColors.fox, red: '#ff4b4b', danger: '#ac3026', disabled: '#e5e5e5',
};

export type Palette = { [Key in keyof typeof light]: string };

export const palettes: Record<'light' | 'dark', Palette> = {
  light,
  dark: {
    background: '#000000', card: '#1c1c1e', soft: '#2c2c2e', text: '#ffffff',
    heading: '#ffffff', secondary: '#aeaeb2', line: '#38383a', outline: '#636366',
    stageFill: '#6b6b6b',
    stageBadge: '#48484a', featuredCard: '#1c1c1e', featuredSecondary: '#aeaeb2', featuredTrack: '#48484a',
    stageActionText: '#ffffff', stageActionEdge: '#38383a',
    accent: brandColors.primary, accentPressed: brandColors.primaryPressed, onAccent: '#042c60',
    selection: '#2c2c2e', blue: '#1cb0f6', blueSoft: '#2c2c2e', link: '#8dd8ff',
    bee: brandColors.bee, fox: brandColors.fox, red: '#ff4b4b', danger: '#ffb4a9', disabled: '#38383a',
  },
};
