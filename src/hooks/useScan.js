import { useMutation } from '@tanstack/react-query';
import { postJson } from '../api';

export function useScan(options = {}) {
  return useMutation({
    mutationFn: ({ imageBase64, language = 'EN', game = 'op' }) =>
      postJson('/scan', { imageBase64, language, game }),
    ...options,
  });
}
