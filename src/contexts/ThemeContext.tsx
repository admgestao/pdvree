import React, { createContext, useContext, useState, useEffect } from 'react';

export const THEMES = [
  { id: 'theme-dark', label: 'Escuro (Laranja)', icon: '🟠' },
  { id: 'theme-light', label: 'Claro', icon: '☀️' },
  { id: 'theme-orange-black', label: 'Laranja + Preto', icon: '🔶' },
  { id: 'theme-blue-black', label: 'Azul + Preto', icon: '🔵' },
  { id: 'theme-blue-white', label: 'Azul + Branco', icon: '💙' },
  { id: 'theme-bw', label: 'Preto e Branco', icon: '⚫' },
  { id: 'theme-green-black', label: 'Verde + Preto', icon: '🟢' },
] as const;

export type ThemeId = typeof THEMES[number]['id'];

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    return (localStorage.getItem('pdv_theme') as ThemeId) || 'theme-dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    THEMES.forEach((t) => root.classList.remove(t.id));
    // Add current theme class
    root.classList.add(theme);
    localStorage.setItem('pdv_theme', theme);
  }, [theme]);

  const setTheme = (t: ThemeId) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
