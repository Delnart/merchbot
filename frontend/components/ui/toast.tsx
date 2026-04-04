type ToastProps = {
  message: string;
};

export default function Toast({ message }: ToastProps) {
  if (!message) return null;
  return <div className="toastMsg">{message}</div>;
}
