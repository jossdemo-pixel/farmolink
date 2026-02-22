import { invokeEdgeWithAutoRefresh } from './edgeAuthService';

export const invokePushDispatchWithAuth = async (
  body: Record<string, unknown>,
  missingSessionError = 'Sessao expirada para notificacoes push.'
): Promise<{ data: any; error: string | null }> => {
  const result = await invokeEdgeWithAutoRefresh({
    functionName: 'push-dispatch',
    body,
    retryOnAuthError: true,
    missingSessionError,
  });

  return {
    data: result.data,
    error: result.error,
  };
};
