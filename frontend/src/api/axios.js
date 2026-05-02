import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
});

// Attach JWT token automatically on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle expired / invalid token globally
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      const code = error.response?.data?.code;
      const msg  = error.response?.data?.message;

      localStorage.removeItem('token');
      localStorage.removeItem('user');

      if (code === 'SESSION_REPLACED' || msg === 'Sesión cerrada en otro dispositivo') {
        sessionStorage.setItem('session_msg', 'Tu sesión fue cerrada porque se inició sesión con tu cuenta desde otro dispositivo.');
      }

      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;