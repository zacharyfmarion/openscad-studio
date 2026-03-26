import { useState, useEffect } from 'react';
import { MOBILE_LAYOUT_MEDIA_QUERY } from '../stores/layoutStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { selectShowWelcome } from '../stores/workspaceSelectors';

export function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const showWelcome = useWorkspaceStore(selectShowWelcome);
  const hideWelcomeScreen = useWorkspaceStore((s) => s.hideWelcomeScreen);

  useEffect(() => {
    if (isMobile && showWelcome) {
      hideWelcomeScreen();
    }
  }, [isMobile, showWelcome, hideWelcomeScreen]);

  return { isMobile };
}
