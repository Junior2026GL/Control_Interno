import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';

export default function RoleRoute({ roles, children }) {
  const { user, loading } = useContext(AuthContext);
  if (loading) return null;
  if (!user) return <Navigate to="/login" />;
  return roles.includes(user.rol) ? children : <Navigate to="/dashboard" />;
}