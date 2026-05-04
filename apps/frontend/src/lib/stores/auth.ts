import { writable, derived } from 'svelte/store';
import { api } from '$lib/api/client';
import type { User } from '$lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true
  });

  return {
    subscribe,
    
    async init() {
      const token = api.getToken();
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }

      try {
        const { user } = await api.getCurrentUser();
        set({ user, isAuthenticated: true, isLoading: false });
      } catch {
        api.logout();
        set({ user: null, isAuthenticated: false, isLoading: false });
      }
    },

    async login(username: string, password: string) {
      await api.login(username, password);
      const { user } = await api.getCurrentUser();
      set({ user, isAuthenticated: true, isLoading: false });
    },

    logout() {
      api.logout();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  };
}

export const auth = createAuthStore();
export const isAuthenticated = derived(auth, $auth => $auth.isAuthenticated);
export const currentUser = derived(auth, $auth => $auth.user);
