export type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

function readInitDataFromHash(): string {
  if (typeof window === "undefined") return "";
  const rawHash = window.location.hash?.replace(/^#/, "") ?? "";
  if (!rawHash) return "";
  const params = new URLSearchParams(rawHash);
  return params.get("tgWebAppData") ?? "";
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const w = window as TelegramWindow;
  return w.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string {
  const fromWebApp = getTelegramWebApp()?.initData ?? "";
  if (fromWebApp) return fromWebApp;
  return readInitDataFromHash();
}

export function isOpenedInTelegram(): boolean {
  return getTelegramInitData().length > 0;
}
