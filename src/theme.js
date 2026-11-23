import { createTheme } from '@mantine/core';

// Navidad discreta: rojo bordó como primario, verde pino como secundario.
const cranberry = [
  '#fdf0f1', '#f7dcdf', '#eeb6bc', '#e48d97', '#dc6a77',
  '#d7525f', '#d54555', '#bc3646', '#a82e3d', '#932433',
];
const pine = [
  '#eef7f1', '#d9ebdf', '#b2d6bf', '#87c09b', '#64ad7e',
  '#4ea06b', '#429a60', '#348650', '#2b7745', '#1b6637',
];

export const theme = createTheme({
  primaryColor: 'cranberry',
  colors: { cranberry, pine },
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  defaultRadius: 'md',
});
