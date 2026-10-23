import { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

export default function ModuleRoute({ modulo, children }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.rol === 'SUPER_ADMIN') return children;
  if ([].concat(modulo).some(m => user.modulos?.includes(m))) return children;
  return <Navigate to="/dashboard" replace />;
}
