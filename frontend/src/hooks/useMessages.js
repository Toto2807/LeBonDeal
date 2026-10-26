import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { getSocket } from '../lib/socket.js';

// Historique d'une conversation : on charge les 30 messages les plus récents,
// « Voir les messages précédents » charge les 30 d'avant (paramètre `before` = date du plus ancien déjà reçu).
// Réponse de GET /api/conversations/:id/messages : { data: [messages, du plus récent au plus ancien], meta: { nextBefore } }
export function useMessages(conversationId) {
  const queryClient = useQueryClient();
  const queryKey = ['messages', conversationId];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api(`/conversations/${conversationId}/messages`, { params: { before: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextBefore ?? undefined,
    enabled: Boolean(conversationId),
  });

  // Temps réel : le serveur émet « message:new » ; on ajoute le message en tête de la première page, sans recharger.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return undefined;

    const onNewMessage = (message) => {
      if (message.conversationId !== conversationId) return;
      queryClient.setQueryData(queryKey, (old) => old && {
        ...old,
        pages: old.pages.map((page, index) => (index === 0 ? { ...page, data: [message, ...page.data] } : page)),
      });
    };
    socket.on('message:new', onNewMessage);
    return () => socket.off('message:new', onNewMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, queryClient]);

  return query;
}

export function sendMessage(conversationId, text) {
  return api(`/conversations/${conversationId}/messages`, { method: 'POST', body: { text } });
}
