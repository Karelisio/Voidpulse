/**
 * Mises à jour in-app (version GitHub d'Android uniquement) : vérification au lancement (au
 * plus une fois par jour) ou à la demande, feuille de proposition, téléchargement avec reprise
 * et contrôle SHA-256 (natif), puis installation par l'installateur Android. Jamais pendant
 * une partie : la feuille n'est montrée que sur l'écran titre.
 */
import { App } from '@capacitor/app';
import { create } from 'zustand';
import appConfig from '../../config/app.json';
import { isNative, VoidpulseNative, type BuildInfo } from '../platform/native';
import { useSave } from '../state/save';
import { fetchUpdate, resolveSha256, type UpdateInfo } from './github';

export type UpdateStatus =
  'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'permission' | 'error';

interface UpdateState {
  /** Le module est actif (Android, version GitHub). */
  supported: boolean;
  installed: string;
  status: UpdateStatus;
  info: UpdateInfo | null;
  /** Feuille ouverte. */
  open: boolean;
  received: number;
  total: number;
  error: string | null;
  path: string | null;
}

const WEB_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0-dev';

export const useUpdate = create<UpdateState>(() => ({
  supported: false,
  installed: WEB_VERSION,
  status: 'idle',
  info: null,
  open: false,
  received: 0,
  total: -1,
  error: null,
  path: null,
}));

let build: BuildInfo | null = null;

/** Lit la version installée et active le module si la variante le permet. */
export async function initUpdater(): Promise<void> {
  if (!isNative()) return;
  try {
    build = await VoidpulseNative.buildInfo();
  } catch {
    return;
  }
  useUpdate.setState({ supported: build.updater, installed: build.versionName });
  if (!build.updater) return;
  await VoidpulseNative.addListener('downloadProgress', (p) => {
    useUpdate.setState({ received: p.received, total: p.total });
  });
  // Retour des réglages « Sources inconnues » : on relance l'installation si elle est permise.
  await App.addListener('resume', () => {
    if (useUpdate.getState().status === 'permission') void install();
  });
}

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * Vérifie s'il existe une version plus récente. `manual` : demande du joueur (ignore la
 * limite quotidienne et la version ignorée, ouvre la feuille même sans nouveauté).
 */
export async function checkForUpdates(manual: boolean): Promise<void> {
  const st = useUpdate.getState();
  if (!st.supported || st.status === 'checking' || st.status === 'downloading') return;
  const save = useSave.getState();
  const prefs = save.data.update;
  const now = Date.now();
  if (!manual) {
    if (!prefs.auto) return;
    if (now - prefs.lastCheck < appConfig.update.checkEveryHours * 3_600_000) return;
  }
  useUpdate.setState({ status: 'checking', error: null, open: manual });
  try {
    const info = await fetchUpdate(st.installed, prefs.prerelease);
    save.update((d) => {
      d.update.lastCheck = now;
    });
    if (!info) {
      useUpdate.setState({ status: 'none', info: null });
      return;
    }
    const skip = !manual && info.version === prefs.ignored;
    useUpdate.setState({ status: 'available', info, open: manual || !skip });
  } catch (e) {
    useUpdate.setState({ status: 'error', error: errorText(e), open: manual });
  }
}

export function closeSheet(): void {
  const s = useUpdate.getState().status;
  if (s === 'downloading') void VoidpulseNative.cancelDownload();
  useUpdate.setState({
    open: false,
    status: s === 'downloading' ? 'available' : s,
  });
}

/** « Ignorer cette version » : plus proposée automatiquement. */
export function ignoreVersion(): void {
  const info = useUpdate.getState().info;
  if (info) {
    useSave.getState().update((d) => {
      d.update.ignored = info.version;
    });
  }
  useUpdate.setState({ open: false });
}

export async function download(): Promise<void> {
  const { info } = useUpdate.getState();
  if (!info) return;
  useUpdate.setState({ status: 'downloading', received: 0, total: info.size, error: null });
  try {
    const sha256 = await resolveSha256(info);
    const { path } = await VoidpulseNative.download({
      url: info.url,
      fileName: info.fileName,
      sha256,
    });
    useUpdate.setState({ status: 'ready', path });
    await install();
  } catch (e) {
    // Annulation par la fermeture de la feuille : pas une erreur à afficher.
    if (useUpdate.getState().status !== 'downloading') return;
    useUpdate.setState({ status: 'error', error: errorText(e) });
  }
}

/** Ouvre l'installateur, après l'autorisation « Installer des applis inconnues » si besoin. */
export async function install(): Promise<void> {
  const { path } = useUpdate.getState();
  if (!path) return;
  try {
    const { allowed } = await VoidpulseNative.canInstall();
    if (!allowed) {
      useUpdate.setState({ status: 'permission' });
      await VoidpulseNative.openInstallSettings();
      return;
    }
    useUpdate.setState({ status: 'ready' });
    await VoidpulseNative.install({ path });
  } catch (e) {
    useUpdate.setState({ status: 'error', error: errorText(e) });
  }
}
