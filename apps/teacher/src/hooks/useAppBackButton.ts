import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Toast } from '@capacitor/toast';

export interface UseAppBackButtonOptions {
  onCustomBack?: () => boolean;
}

export function useAppBackButton(options?: UseAppBackButtonOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressRef = useRef<number>(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    let listenerHandle: { remove: () => void } | null = null;

    const setupListener = async () => {
      try {
        listenerHandle = await App.addListener('backButton', async ({ canGoBack }) => {
          if (optionsRef.current?.onCustomBack && optionsRef.current.onCustomBack()) {
            return;
          }

          const openModalCloseBtn = document.querySelector<HTMLButtonElement>(
            '[role="dialog"] button[aria-label="Close dialog"], [role="dialog"] button[data-dismiss="modal"]'
          );
          if (openModalCloseBtn) {
            openModalCloseBtn.click();
            return;
          }

          const openModal = document.querySelector('[role="dialog"]');
          if (openModal) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return;
          }

          const isRootRoute = location.pathname === '/' || location.pathname === '/login';

          if (!isRootRoute) {
            if (canGoBack && window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/', { replace: true });
            }
            return;
          }

          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            await App.exitApp();
          } else {
            lastBackPressRef.current = now;
            try {
              await Toast.show({
                text: 'Press back again to exit',
                duration: 'short',
                position: 'bottom',
              });
            } catch {
              // Toast not supported in web context
            }
          }
        });
      } catch {
        // App plugin not active in browser runtime
      }
    };

    setupListener();

    return () => {
      if (listenerHandle?.remove) {
        listenerHandle.remove();
      }
    };
  }, [location.pathname, navigate]);
}
