import { createContext, useContext } from 'react';

export type ToastKind = 'success' | 'error';

export const ToastContext = createContext<(kind: ToastKind, message: string) => void>(
  () => undefined,
);

export function useToast() {
  const push = useContext(ToastContext);
  return {
    success: (message: string) => push('success', message),
    error: (message: string) => push('error', message),
  };
}
