import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastList, ToastProps, ToastType } from '../components/Toast';

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => string;
  showSuccess: (message: string, title?: string) => string;
  showError: (message: string, title?: string) => string;
  showWarning: (message: string, title?: string) => string;
  showInfo: (message: string, title?: string) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

let toastIdCounter = 0;

const generateToastId = (): string => {
  return `toast-${Date.now()}-${toastIdCounter++}`;
};

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration = 3000): string => {
      const id = generateToastId();
      const newToast: ToastProps = {
        id,
        type,
        message,
        title,
        duration,
      };

      setToasts((prev) => [...prev, newToast]);
      return id;
    },
    []
  );

  const removeToast = useCallback((id: string): void => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration?: number): string => {
      return addToast(message, type, title, duration);
    },
    [addToast]
  );

  const showSuccess = useCallback(
    (message: string, title?: string): string => {
      return addToast(message, 'success', title);
    },
    [addToast]
  );

  const showError = useCallback(
    (message: string, title?: string): string => {
      return addToast(message, 'error', title);
    },
    [addToast]
  );

  const showWarning = useCallback(
    (message: string, title?: string): string => {
      return addToast(message, 'warning', title);
    },
    [addToast]
  );

  const showInfo = useCallback(
    (message: string, title?: string): string => {
      return addToast(message, 'info', title);
    },
    [addToast]
  );

  const dismissToast = useCallback((id: string): void => {
    removeToast(id);
  }, [removeToast]);

  const dismissAll = useCallback((): void => {
    setToasts([]);
  }, []);

  const value: ToastContextValue = {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    dismissToast,
    dismissAll,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastList toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export default useToast;
