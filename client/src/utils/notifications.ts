import toast from 'react-hot-toast';

const baseStyle = {
  border: '3px solid #111111',
  fontFamily: 'monospace',
  fontWeight: 'bold',
  textTransform: 'uppercase' as const,
};

export const notify = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  info: (message: string) =>
    toast(message, {
      icon: 'ℹ️',
      style: { ...baseStyle, background: '#111111', color: '#FAF9F6' },
    }),
  warning: (message: string) =>
    toast(message, {
      icon: '⚠️',
      style: { ...baseStyle, background: '#FFCC00', color: '#111111' },
      duration: 4500,
    }),
};
