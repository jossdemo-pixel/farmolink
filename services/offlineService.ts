import { supabase } from './supabaseClient';

const OFFLINE_QUEUE_KEY = 'farmolink_offline_queue_v1';

type OfflineActionType = 'profile_update' | 'support_ticket_create' | 'support_message_send';

interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, any>;
  createdAt: string;
}

const readQueue = (): OfflineAction[] => {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (queue: OfflineAction[]) => {
  try {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Erro ao salvar fila offline', e);
  }
};

export const isOfflineNow = (): boolean => !navigator.onLine;

export const getOfflineQueue = (): OfflineAction[] => readQueue();

export const getPendingQueueCount = (): number => readQueue().length;

export const enqueueOfflineAction = (type: OfflineActionType, payload: Record<string, any>) => {
  const queue = readQueue();
  const next: OfflineAction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString()
  };
  writeQueue([...queue, next]);
  return next.id;
};

const runAction = async (action: OfflineAction): Promise<boolean> => {
  try {
    if (action.type === 'profile_update') {
      const { userId, name, phone, address } = action.payload;
      const { error } = await supabase
        .from('profiles')
        .update({ name, phone, address })
        .eq('id', userId);
      return !error;
    }

    if (action.type === 'support_ticket_create') {
      const { userId, name, email, subject, message } = action.payload;
      const { data: ticket, error: tError } = await supabase
        .from('support_tickets')
        .insert([{ user_id: userId, user_name: name, user_email: email, subject, status: 'OPEN' }])
        .select('id')
        .single();

      if (tError || !ticket?.id) return false;

      const { error: mError } = await supabase.from('support_messages').insert([{
        ticket_id: ticket.id,
        sender_id: userId,
        sender_name: name,
        sender_role: 'CUSTOMER',
        message
      }]);
      return !mError;
    }

    if (action.type === 'support_message_send') {
      const { ticketId, senderId, senderName, senderRole, message } = action.payload;
      const { error } = await supabase.from('support_messages').insert([{
        ticket_id: ticketId,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: senderRole,
        message
      }]);
      return !error;
    }

    return false;
  } catch {
    return false;
  }
};

export const processOfflineQueue = async (): Promise<{ processed: number; failed: number }> => {
  if (isOfflineNow()) return { processed: 0, failed: readQueue().length };

  const queue = readQueue();
  if (!queue.length) return { processed: 0, failed: 0 };

  const pending: OfflineAction[] = [];
  let processed = 0;
  let failed = 0;

  for (const action of queue) {
    const ok = await runAction(action);
    if (ok) {
      processed += 1;
    } else {
      failed += 1;
      pending.push(action);
    }
  }

  writeQueue(pending);
  return { processed, failed };
};

