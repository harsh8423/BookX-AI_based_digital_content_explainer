// Authentication utilities for frontend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export class AuthService {
  constructor() {
    this.user = null;
    this.token = null;
    this.loadFromStorage();
  }

  loadFromStorage() {
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      
      if (storedUser && storedToken) {
        this.user = JSON.parse(storedUser);
        this.token = storedToken;
      }
    }
  }

  saveToStorage(user, token) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('token', token);
      this.user = user;
      this.token = token;
    }
  }

  clearStorage() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      this.user = null;
      this.token = null;
    }
  }

  isAuthenticated() {
    return !!(this.user && this.token);
  }

  async authenticateWithGoogle(credential) {
    try {
      console.log('Sending authentication request to:', `${API_BASE_URL}/auth/google`);
      
      // Send credential token to our backend
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token: credential
        }),
      });

      console.log('Authentication response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Authentication failed:', errorText);
        throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Authentication successful, saving to storage');
      this.saveToStorage(data.user, data.access_token);
      return data;
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearStorage();
    }
  }

  async verifyToken() {
    if (!this.token) return false;

    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      return response.ok;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  getToken() {
    return this.token;
  }

  getAuthHeaders() {
    return this.token ? { 'Authorization': `Bearer ${this.token}` } : {};
  }
}

// Global auth service instance
export const authService = new AuthService();