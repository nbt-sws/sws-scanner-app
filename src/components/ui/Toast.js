import React, { createContext, useCallback, useContext, useState } from 'react';
import { Icon } from '../Icon';

const ToastContext = createContext(null);

const TYPE_STYLES = {
  error: {
    border: 'border-error',
    icon: 'error',
    iconClass: 'text-error',
    bg: 'bg-error/10',
  },
  success: {
    border: 'border-green-400',
    icon: 'check_circle',
    iconClass: 'text-green-400',
    bg: 'bg-green-400/10',
  },
  warning: {
    border: 'border-amber-400',
    icon: 'warning',
    iconClass: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  info: {
    border: 'border-primary-fixed-dim',
    icon: 'info',
    iconClass: 'text-primary-fixed-dim',
    bg: 'bg-primary-fixed-dim/10',
  },
};

function ToastItem({ toast, onRemove }) {
  const style = TYPE_STYLES[toast.type] || TYPE_STYLES.info;

  return (
    <div
      className={`w-[320px] max-w-[90vw] glass-panel rounded-xl border-l-4 ${style.border} ${style.bg} p-4 shadow-lg animate-fade-up flex items-start gap-3`}
      role="alert"
    >
      <Icon name={style.icon} size={20} className={`shrink-0 mt-0.5 ${style.iconClass}`} filled />
      <div className="flex-1 min-w-0">
        {toast.title && (
          <div className="font-label-caps text-label-caps text-on-surface mb-0.5">
            {toast.title}
          </div>
        )}
        <div className="font-body-sm text-body-sm text-on-surface-variant">
          {toast.message}
        </div>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-on-surface-variant hover:text-on-surface transition-colors"
        aria-label="Close notification"
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(({ type = 'info', title, message, duration = 5000 }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const toast = { id, type, title, message };
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }

    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <ToastItem toast={toast} onRemove={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
