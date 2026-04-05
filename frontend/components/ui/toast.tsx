'use client';

import { useEffect, useRef, useState } from 'react';

interface ToastProps {
  message: string;
}

export default function Toast({ message }: ToastProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message]);

  return (
    <div className={`toast ${visible ? 'show' : ''}`} aria-live="polite" role="status">
      {message}
    </div>
  );
}