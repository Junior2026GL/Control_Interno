import { createContext, useState, useEffect } from 'react';
import api from '../api/axios';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser && storedUser !== 'undefined') {
      try {
        setUser(JSON.parse(storedUser));
      } catch (err) {
        console.error('Error parsing user:', err);
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = (userData, token, refreshToken) => {
    const normalized = { ...userData, modulos: userData.modulos || [] };
    setUser(normalized);
    localStorage.setItem('user', JSON.stringify(normalized));
    if (token)        localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  };

  const logout = () => {
    const refreshToken = localStorage.getItem('refreshToken');
    // Revocar el refresh token en el servidor (best-effort, no bloqueante)
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
