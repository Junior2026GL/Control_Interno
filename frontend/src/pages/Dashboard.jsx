import { useState } from 'react';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import { FiUsers, FiDollarSign, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import './Dashboard.css';

export default function Dashboard() {
  const [stats] = useState([
    { title: 'Total Usuarios', value: '12', icon: FiUsers, color: '#667eea' },
    { title: 'Caja Chica', value: '$2,450', icon: FiDollarSign, color: '#764ba2' },
    { title: 'Movimientos', value: '45', icon: FiCheckCircle, color: '#00c853' },
    { title: 'Pendientes', value: '8', icon: FiAlertCircle, color: '#ff6b6b' },
  ]);

  return (
    <div className="dashboard-container">
      <Sidebar />
      <div className="main-content">
        <Navbar />
        <div className="dashboard-content">
          <div className="page-header">
            <h1>Dashboard</h1>
            <p>Bienvenido al panel de administración</p>
          </div>

          <div className="stats-grid">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="stat-card">
                  <div className="stat-header">
                    <div className="stat-icon" style={{ color: stat.color }}>
                      <Icon size={32} />
                    </div>
                  </div>
                  <div className="stat-body">
                    <h3 className="stat-title">{stat.title}</h3>
                    <p className="stat-value">{stat.value}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="recent-section">
            <h2>Últimas Actividades</h2>
            <div className="activity-placeholder">
              <p>No hay actividades registradas aún</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}