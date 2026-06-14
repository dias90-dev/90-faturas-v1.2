export const requestNotificationPermission = async () => {
  if (!('Notification' in window)) {
    console.warn('Este browser não suporta notificações de desktop');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

export const showNotification = async (title: string, body: string, url: string = '/') => {
  let hasPermission = Notification.permission === 'granted';
  
  if (!hasPermission) {
    hasPermission = await requestNotificationPermission();
  }

  if (hasPermission) {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        options: {
          body,
          icon: '/icon.png',
          badge: '/icon.png',
          data: { url }
        }
      });
    } else {
      new Notification(title, { body, icon: '/icon.png' });
    }
  }
};

import { HistoryRecord } from '../types';

export const checkOverdueInvoices = (history: HistoryRecord[]) => {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const notifiedKey = 'f90_notified_overdue';
  let notified: string[] = [];
  try {
    notified = JSON.parse(localStorage.getItem(notifiedKey) || '[]');
  } catch (e) { }

  const newOverdue = history.filter(record => {
    if (record.status !== 'Pendente' || !record.dueDate) return false;
    
    // Check if due date is passed
    const parts = record.dueDate.split('-'); // assuming YYYY-MM-DD
    if (parts.length === 3) {
      const dueDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      if (dueDate < today && !notified.includes(record.id)) {
        return true;
      }
    }
    return false;
  });

  if (newOverdue.length > 0) {
    newOverdue.forEach(record => {
      showNotification(
        'Fatura Vencida!',
        `A fatura ${record.num} do cliente ${record.client} atingiu a data de vencimento.`
      );
      notified.push(record.id);
    });

    localStorage.setItem(notifiedKey, JSON.stringify(notified));
  }
};
