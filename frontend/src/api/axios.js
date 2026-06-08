import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

const api = axios.create({ baseURL: BASE_URL });

// ── Adjuntar access token en cada petición ────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Variable para evitar múltiples renovaciones simultáneas ──
let _refreshing = null;

// ── Interceptor de respuesta: renovación silenciosa ──────────
api.interceptors.response.use(
  response => response,
  async error => {
    const original = error.config;

    // Solo intentar renovar si: 401, hay refresh token, y no es el endpoint /refresh mismo
    if (
      error.response?.status === 401 &&
      !original._retried &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/login')
    ) {
      original._retried = true;
      const refreshToken = localStorage.getItem('refreshToken');

      if (!refreshToken) {
        // Sin refresh token → forzar logout
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login?expired=1';
        return Promise.reject(error);
      }

      try {
        // Si ya hay una renovación en curso, esperar a que termine
        if (!_refreshing) {
          _refreshing = axios.post(`${BASE_URL}/auth/refresh`, { refreshToken })
            .then(res => {
              const newToken = res.data.token;
              localStorage.setItem('token', newToken);
              return newToken;
            })
            .catch(err => {
              // Refresh inválido/expirado → logout
              localStorage.removeItem('token');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              window.location.href = '/login?expired=1';
              throw err;
            })
            .finally(() => { _refreshing = null; });
        }

        const newToken = await _refreshing;
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original); // reintentar la petición original con el token nuevo
      } catch {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
