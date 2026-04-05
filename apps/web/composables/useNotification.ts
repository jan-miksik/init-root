type NotificationKind = 'success' | 'error';

export type SiteNotification = {
  type: NotificationKind;
  title?: string;
  message: string;
  durationMs?: number;
};

type NotificationState = {
  id: number;
  type: NotificationKind;
  title?: string;
  message: string;
};

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export function useNotification() {
  const notification = useState<NotificationState | null>('site-notification', () => null);

  function clearNotification() {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    notification.value = null;
  }

  function showNotification(payload: SiteNotification) {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    const id = Date.now();
    notification.value = {
      id,
      type: payload.type,
      title: payload.title,
      message: payload.message,
    };

    const durationMs = payload.durationMs ?? 6_500;
    if (durationMs > 0) {
      dismissTimer = setTimeout(() => {
        if (notification.value?.id === id) {
          notification.value = null;
        }
        dismissTimer = null;
      }, durationMs);
    }
  }

  return {
    notification,
    showNotification,
    clearNotification,
  };
}
