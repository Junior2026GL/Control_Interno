import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import CajaChica from './pages/CajaChica';
import BaseDatos from './pages/BaseDatos';
import ForgotPassword from './pages/ForgotPassword';
import PrivateRoute from './components/PrivateRoute';
import RoleRoute from './components/RoleRoute';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/usuarios" element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN']}><Usuarios /></RoleRoute>} />
          <Route path="/caja" element={<PrivateRoute><CajaChica /></PrivateRoute>} />
          <Route path="/base-datos" element={<RoleRoute roles={['SUPER_ADMIN']}><BaseDatos /></RoleRoute>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}