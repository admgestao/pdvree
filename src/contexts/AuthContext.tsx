import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(() => {
    try {
      const savedUser = localStorage.getItem('pdv_user_session');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch { return null; }
  });

  const [loading] = useState(false);

  // AQUI ESTÁ A CHAVE: isAdmin precisa incluir o check do nome_usuario
  const isAdmin = user?.nome_usuario === 'planex' || user?.role === 'admin' || user?.isAdmin === true;
  const isDeveloper = user?.nome_usuario === 'planex' || user?.role === 'developer' || user?.isDeveloper === true;

  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
    window.location.href = '#/login';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser, 
      loading, 
      isAdmin, 
      isDeveloper,
      logout: handleLogout 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) return { user: null, isAdmin: false, isDeveloper: false };
  return context;
};