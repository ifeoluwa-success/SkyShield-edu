import toast from 'react-hot-toast';

export type ToastType = 'success' | 'error' | 'info';

export function showToast({ type, message }: { type: ToastType; message: string }) {
  switch (type) {
    case 'success':
      return toast.success(message);
    case 'error':
      return toast.error(message);
    case 'info':
    default:
      return toast(message);
  }
}
