export const auth = {
  getToken: () => localStorage.getItem('token'),
  setToken: (token: string) => localStorage.setItem('token', token),
  clearToken: () => localStorage.removeItem('token'),
  getUser: () => {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
  },
  setUser: (user: any) => localStorage.setItem('user', JSON.stringify(user)),

  getAuthHeaders: () => {
      const token = localStorage.getItem('token');
      return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  },

  checkSetup: async () => {
      const res = await fetch('/api/setup-status');
      return res.json();
  },

  setup: async (data: any) => {
      const res = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
      });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Setup failed');
      }
      return res.json();
  },

  login: async (data: any) => {
      const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Login failed');
      return res.json();
  },

  // User Management
  listUsers: async () => {
      const res = await fetch('/api/users', { headers: auth.getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to list users');
      return res.json();
  },

  createUser: async (data: any) => {
      const res = await fetch('/api/users', {
          method: 'POST',
          headers: auth.getAuthHeaders(),
          body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Failed to create user');
      return res.json();
  },

  deleteUser: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, {
          method: 'DELETE',
          headers: auth.getAuthHeaders()
      });
      if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to delete user');
      }
  }
};
