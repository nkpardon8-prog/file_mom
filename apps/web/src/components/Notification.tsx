import { X, CheckCircle2, AlertCircle } from 'lucide-react';

export interface NotificationData {
  type: 'success' | 'error';
  title: string;
  message: string;
}

interface NotificationProps {
  notification: NotificationData;
  onDismiss: () => void;
}

export function Notification({ notification, onDismiss }: NotificationProps) {
  const isSuccess = notification.type === 'success';
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${isSuccess ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-start gap-3">
        {isSuccess
          ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />}
        <div className="flex-1">
          <p className={`text-sm font-medium ${isSuccess ? 'text-green-800' : 'text-red-800'}`}>{notification.title}</p>
          <p className={`mt-1 text-sm ${isSuccess ? 'text-green-700' : 'text-red-700'}`}>{notification.message}</p>
        </div>
        <button onClick={onDismiss} className="shrink-0 text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
