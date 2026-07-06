import { useVaultItems as useApiVaultItems } from './useVaultApi';
import { useVault as useFirestoreVault } from '../vault';
import { isVaultApiEnabled } from './useVaultApi';

// Unified vault hook. Uses backend vault API when REACT_APP_USE_VAULT_API / REACT_APP_VAULT_API_URL
// is configured; otherwise falls back to the Firestore-backed useVault() for local/offline dev.
export function useVault(user, getToken) {
  const api = useApiVaultItems(user, getToken, { retry: 1 });
  const firestore = useFirestoreVault(user?.uid);

  if (isVaultApiEnabled()) {
    return {
      items: api.data || [],
      loading: api.isLoading,
      error: api.error,
      refetch: api.refetch,
    };
  }
  return firestore;
}
