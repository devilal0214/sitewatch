import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          const { data } = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/refresh`, {
            refreshToken,
          });
          localStorage.setItem('access_token', data.accessToken);
          localStorage.setItem('refresh_token', data.refreshToken);
          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(original);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          if (typeof window !== 'undefined') window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  },
);

export default api;

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    api.post('/api/auth/register', { name, email, password }),
  logout: (refreshToken: string) =>
    api.post('/api/auth/logout', { refreshToken }),
  me: () => api.get('/api/auth/me'),
  updateProfile: (data: any) => api.put('/api/auth/profile', data),
};

// ── Websites ──────────────────────────────────────────────────────────────────
export const websitesApi = {
  list: () => api.get('/api/websites'),
  get: (id: string) => api.get(`/api/websites/${id}`),
  create: (data: any) => api.post('/api/websites', data),
  update: (id: string, data: any) => api.patch(`/api/websites/${id}`, data),
  delete: (id: string) => api.delete(`/api/websites/${id}`),
  uptimeLogs: (id: string, hours?: number) => api.get(`/api/websites/${id}/uptime`, { params: { hours } }),
  uptime: (id: string, period?: string) => api.get(`/api/websites/${id}/uptime`, { params: { period } }),
  performance: (id: string, hours?: number) => api.get(`/api/websites/${id}/performance`, { params: { hours } }),
  triggerCheck: (id: string) => api.post(`/api/websites/${id}/trigger-check`),
};

// ── Servers ───────────────────────────────────────────────────────────────────
export const serversApi = {
  list: () => api.get('/api/servers'),
  get: (id: string) => api.get(`/api/servers/${id}`),
  create: (data: any) => api.post('/api/servers', data),
  update: (id: string, data: any) => api.patch(`/api/servers/${id}`, data),
  delete: (id: string) => api.delete(`/api/servers/${id}`),
  metrics: (id: string, period?: string) => api.get(`/api/servers/${id}/metrics`, { params: { period } }),
  containers: (id: string) => api.get(`/api/servers/${id}/containers`),
};

// ── Incidents ─────────────────────────────────────────────────────────────────
export const incidentsApi = {
  list: (params?: any) => api.get('/api/incidents', { params }),
  get: (id: string) => api.get(`/api/incidents/${id}`),
  acknowledge: (id: string) => api.patch(`/api/incidents/${id}/acknowledge`),
  resolve: (id: string, resolution?: string) => api.patch(`/api/incidents/${id}/resolve`, { resolution }),
  stats: () => api.get('/api/incidents/stats/summary'),
  summary: () => api.get('/api/incidents/stats/summary'),
};

// ── Alerts ────────────────────────────────────────────────────────────────────
export const alertsApi = {
  list: () => api.get('/api/alerts'),
  create: (data: any) => api.post('/api/alerts', data),
  update: (id: string, data: any) => api.patch(`/api/alerts/${id}`, data),
  delete: (id: string) => api.delete(`/api/alerts/${id}`),
  toggle: (id: string) => api.patch(`/api/alerts/${id}/toggle`),
  logs: () => api.get('/api/alerts/logs'),
};

// ── Reports ───────────────────────────────────────────────────────────────────
export const reportsApi = {
  list: () => api.get('/api/reports'),
  get: (id: string) => api.get(`/api/reports/${id}`),
  generate: (data: any) => api.post('/api/reports/generate', data),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminApi = {
  health: () => api.get('/api/admin/system-health'),
  systemHealth: () => api.get('/api/admin/system-health'),
  users: (params?: any) => api.get('/api/admin/users', { params }),
  updateUser: (id: string, data: any) => api.patch(`/api/admin/users/${id}`, data),
  metrics: () => api.get('/api/admin/metrics'),
};

// ── Status page ───────────────────────────────────────────────────────────────
export const statusApi = {
  page: (slug: string) => api.get(`/api/status/${slug}`),
  get: (slug: string) => api.get(`/api/status/${slug}`),
};
