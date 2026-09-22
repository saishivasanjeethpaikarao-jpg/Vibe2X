import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Snackbar } from './Snackbar';

export interface SnackbarAction {
  label: string;
  onPress: () => void;
}

export interface SnackbarOptions {
  action?: SnackbarAction;
  duration?: number;
}

interface SnackbarContextType {
  show: (message: string, options?: SnackbarOptions) => void;
}

const SnackbarContext = createContext<SnackbarContextType | null>(null);

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};

export const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const [action, setAction] = useState<SnackbarAction | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((newMessage: string, options?: SnackbarOptions) => {
    setMessage(newMessage);
    setAction(options?.action);
    setVisible(true);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    const duration = options?.duration ?? 3000;
    timerRef.current = setTimeout(() => {
      setVisible(false);
    }, duration);
  }, []);

  const handleActionPress = useCallback(() => {
    if (action) {
      action.onPress();
    }
    setVisible(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, [action]);

  return (
    <SnackbarContext.Provider value={{ show }}>
      {children}
      <Snackbar
        visible={visible}
        message={message}
        action={action ? { ...action, onPress: handleActionPress } : undefined}
      />
    </SnackbarContext.Provider>
  );
};
