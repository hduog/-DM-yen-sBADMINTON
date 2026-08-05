export {};

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: { start_param?: string };
        ready: () => void;
        expand: () => void;
        colorScheme: "light" | "dark";
        themeParams: Record<string, string>;
      };
    };
  }
}
