import { useMutation } from '@tanstack/react-query';
import { postJson } from '../api';

export function useScan(options = {}) {
  return useMutation({
    mutationFn: ({ imageBase64, language = 'EN', game = 'op' }) =>
      postJson('/scan', {
        image: imageBase64,
        tcg: game,
        lang: language,
      }),
    ...options,
  });
}
