// Firebase UID -> deterministic backend service UUID mapping.
// The backend vault/user services expect X-User-ID to be a UUID, not a
// Firebase UID. We derive a stable v5 UUID from the Firebase UID so the same
// caller always presents the same identity. If the user microservice returns a
// different canonical id, that id is preferred and cached.

import { useQuery } from '@tanstack/react-query';
import { v5 as uuidv5 } from 'uuid';
import { apiUrl } from '../api';

// DNS namespace from RFC 4122 §4.3 — used to derive a SwibScan namespace.
const SWS_NAMESPACE = uuidv5('sws.swibscan.user', uuidv5.DNS);

export function firebaseUidToServiceId(firebaseUid) {
  if (!firebaseUid) return null;
  return uuidv5(firebaseUid, SWS_NAMESPACE);
}

export function useServiceUserId(user, getToken) {
  const deterministic = firebaseUidToServiceId(user?.uid);

  const { data } = useQuery({
    queryKey: ['service-user-id', user?.uid],
    queryFn: async () => {
      const token = await getToken?.();
      const headers = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const res = await fetch(apiUrl('/user/profile'), { headers });
        if (!res.ok) throw new Error(`profile ${res.status}`);
        const json = await res.json().catch(() => ({}));
        const mapped = json.id || json.userId || json.uuid || json.sub;
        if (mapped) return mapped;
      } catch {
        // Fall back to deterministic mapping when the user service has no
        // canonical mapping endpoint yet.
      }
      return deterministic;
    },
    initialData: deterministic,
    enabled: Boolean(user?.uid),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  return data || deterministic;
}
