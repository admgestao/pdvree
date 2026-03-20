import React, { createContext, useContext, useState, useCallback } from 'react';

interface VisibilityContextType {
  globalVisible: boolean;
  toggleGlobal: () => void;
  hiddenIds: Set<string>;
  toggleId: (id: string) => void;
  isVisible: (id: string) => boolean;
}

const VisibilityContext = createContext<VisibilityContextType | null>(null);

export function VisibilityProvider({ children }: { children: React.ReactNode }) {
  const [globalVisible, setGlobalVisible] = useState(true);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const toggleGlobal = useCallback(() => setGlobalVisible((v) => !v), []);

  const toggleId = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isVisible = useCallback(
    (id: string) => {
      if (!globalVisible) return false;
      return !hiddenIds.has(id);
    },
    [globalVisible, hiddenIds]
  );

  return (
    <VisibilityContext.Provider value={{ globalVisible, toggleGlobal, hiddenIds, toggleId, isVisible }}>
      {children}
    </VisibilityContext.Provider>
  );
}

export function useVisibility() {
  const ctx = useContext(VisibilityContext);
  if (!ctx) throw new Error('useVisibility must be used within VisibilityProvider');
  return ctx;
}
