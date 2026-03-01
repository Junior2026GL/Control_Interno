import { useEffect, useState } from 'react';
import api from '../api/axios';
import Navbar from '../components/Navbar';

export default function CajaChica() {
  const [movimientos, setMovimientos] = useState([]);
  const [saldo, setSaldo] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    api.get('/caja', { headers: { Authorization: `Bearer ${token}` } }).then(res => setMovimientos(res.data));
    api.get('/caja/saldo', { headers: { Authorization: `Bearer ${token}` } }).then(res => setSaldo(res.data.saldo));
  }, []);

  return (
    <div>
      <Navbar />
      <h2 style={{ padding: '20px' }}>Caja Chica - Saldo: {saldo}</h2>
      <table border="1" cellPadding="5" style={{ margin: '20px' }}>
        <thead>
          <tr>
            <th>ID</th>
            <th>Fecha</th>
            <th>Descripción</th>
            <th>Tipo</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map(m => (
            <tr key={m.id}>
              <td>{m.id}</td>
              <td>{m.fecha}</td>
              <td>{m.descripcion}</td>
              <td>{m.tipo}</td>
              <td>{m.monto}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}