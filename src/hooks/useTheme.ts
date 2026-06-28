import { useContext } from 'react';
import { ThemeContext } from '../contexts/themeContext';

export function useTheme() {
  return useContext(ThemeContext);
}
