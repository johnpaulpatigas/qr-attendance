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
          // 1. Custom component callback (e.g. dismiss active modal/view)
          if (optionsRef.current?.onCustomBack && optionsRef.current.onCustomBack()) {
            return;
          }

          // 2. Check for open dialogs / modals / overlays in the DOM
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

          // 3. Navigation: If not on root or login route, navigate back or to root
          const isRootRoute = location.pathname === '/' || location.pathname === '/login';

          if (!isRootRoute) {
            if (canGoBack && window.history.length > 1) {
              navigate(-1);
            } else {
              navigate('/', { replace: true });
            }
            return;
          }

          // 4. On root route: Double-tap back within 2000ms to exit
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
              // Ignore if toast plugin not supported in browser environment
            }
          }
        });
      } catch {
        // App plugin not available in pure browser runtime
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
