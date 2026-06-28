import { useContext } from 'react';
import { ThemeContext } from '../contexts/themeContextDef';

export function useTheme() {
  return useContext(ThemeContext);
}
