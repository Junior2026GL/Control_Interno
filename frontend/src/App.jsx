import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Usuarios from './pages/Usuarios';
import CajaChica from './pages/CajaChica';
import BaseDatos from './pages/BaseDatos';
import Autorizaciones from './pages/Autorizaciones';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Chat from './pages/Chat';
import IpWhitelist from './pages/IpWhitelist';
import Auditoria from './pages/Auditoria';
import Diputados from './pages/Diputados';
import PresupuestoDiputados from './pages/PresupuestoDiputados';
import ReportesPresupuesto from './pages/ReportesPresupuesto';
import Viaticos from './pages/Viaticos';
import ConstanciaTransferencia from './pages/ConstanciaTransferencia';
import Ayudas from './pages/Ayudas';
import AyudasAlcaldias from './pages/AyudasAlcaldias';
import MapaAlcaldias from './pages/MapaAlcaldias';
import Alcaldes from './pages/Alcaldes';
import Proveedores from './pages/Proveedores';
import PrivateRoute from './components/PrivateRoute';
import RoleRoute from './components/RoleRoute';
import ModuleRoute from './components/ModuleRoute';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <SocketProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
            <Route path="/usuarios" element={<ModuleRoute modulo="usuarios"><Usuarios /></ModuleRoute>} />
            <Route path="/caja" element={<ModuleRoute modulo="caja"><CajaChica /></ModuleRoute>} />
            <Route path="/base-datos" element={<ModuleRoute modulo="base-datos"><BaseDatos /></ModuleRoute>} />
            <Route path="/autorizaciones" element={<ModuleRoute modulo="autorizaciones"><Autorizaciones /></ModuleRoute>} />
            <Route path="/chat" element={<ModuleRoute modulo="asistente-ia"><Chat /></ModuleRoute>} />
            <Route path="/ip-whitelist" element={<RoleRoute roles={['SUPER_ADMIN']}><IpWhitelist /></RoleRoute>} />
            <Route path="/auditoria" element={<RoleRoute roles={['SUPER_ADMIN']}><Auditoria /></RoleRoute>} />
            <Route path="/diputados" element={<ModuleRoute modulo="diputados"><Diputados /></ModuleRoute>} />
            <Route path="/presupuesto-social" element={<ModuleRoute modulo="presupuesto-social"><PresupuestoDiputados /></ModuleRoute>} />
            <Route path="/reportes-presupuesto" element={<ModuleRoute modulo="reportes-presupuesto"><ReportesPresupuesto /></ModuleRoute>} />
            <Route path="/viaticos" element={<ModuleRoute modulo="viaticos"><Viaticos /></ModuleRoute>} />
            <Route path="/constancia-transferencia" element={<ModuleRoute modulo="constancia-transferencia"><ConstanciaTransferencia /></ModuleRoute>} />
            <Route path="/ayudas" element={<ModuleRoute modulo="ayudas"><Ayudas /></ModuleRoute>} />
            <Route path="/ayudas-alcaldias" element={<ModuleRoute modulo="ayudas_alcaldias"><AyudasAlcaldias /></ModuleRoute>} />
            <Route path="/mapa-alcaldias" element={<ModuleRoute modulo="mapa-alcaldias"><MapaAlcaldias /></ModuleRoute>} />
            <Route path="/alcaldes" element={<ModuleRoute modulo="alcaldes"><Alcaldes /></ModuleRoute>} />
            <Route path="/proveedores" element={<ModuleRoute modulo="proveedores"><Proveedores /></ModuleRoute>} />
          </Routes>
        </SocketProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}