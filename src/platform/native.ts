/**
 * Pont vers le plugin natif VoidpulseNative (android/app/…/VoidpulseNativePlugin.java).
 * Sur le web, `isNative()` est faux et aucune méthode n'est appelée.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface BuildInfo {
  flavor: 'github' | 'play';
  updater: boolean;
  versionName: string;
  versionCode: number;
  sdk: number;
}

export interface VoidpulseNativePlugin {
  buildInfo(): Promise<BuildInfo>;
  systemAccent(): Promise<{ accent: string | null }>;
  setImmersive(o: { enabled: boolean }): Promise<void>;
  download(o: { url: string; fileName: string; sha256: string }): Promise<{ path: string }>;
  cancelDownload(): Promise<void>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(o: { path: string }): Promise<void>;
  addListener(
    event: 'downloadProgress',
    fn: (p: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}

export const VoidpulseNative = registerPlugin<VoidpulseNativePlugin>('VoidpulseNative');

export const isNative = (): boolean => Capacitor.isNativePlatform();
