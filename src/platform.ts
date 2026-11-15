import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';

/** True inside the Capacitor iOS app (false in a normal browser). */
export const isNative = Capacitor.isNativePlatform();

/** Haptic feedback: alarms buzz, bumps tap. Falls back to the Vibration API in browsers that have one. */
export function haptic(kind: 'alarm' | 'bump' | 'tap'): void {
  try {
    if (isNative) {
      if (kind === 'alarm') void Haptics.notification({ type: NotificationType.Warning });
      else void Haptics.impact({ style: kind === 'bump' ? ImpactStyle.Medium : ImpactStyle.Light });
    } else navigator.vibrate?.(kind === 'alarm' ? [60, 40, 60] : 30);
  } catch {
    /* haptics are a nicety */
  }
}

/** Lock the native app to landscape (the cutaway is wide). */
export function lockLandscape(): void {
  if (isNative) void ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined);
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;

/** Safe-area insets (notch, Dynamic Island, home bar) in CSS pixels, read from env(safe-area-inset-*). */
export function safeInsets(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}
