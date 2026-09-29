/**
 * Fichiers et partage : export de la sauvegarde vers un fichier (Android : cache + feuille de
 * partage système, pour l'enregistrer dans Fichiers, Drive…; web : téléchargement), import
 * depuis un fichier choisi, partage d'un texte (résultat de partie).
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative } from './native';

export async function exportFile(fileName: string, text: string, title: string): Promise<void> {
  if (isNative()) {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Ouvre le sélecteur de fichiers et renvoie le texte choisi (null si annulé). */
export function pickTextFile(accept = '.txt,.voidpulse,text/plain'): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) {
        resolve(null);
        return;
      }
      f.text().then(resolve, reject);
    });
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.click();
  });
}

/** Partage un texte (feuille système), à défaut le copie dans le presse-papiers. */
export async function shareText(title: string, text: string): Promise<'shared' | 'copied'> {
  if (isNative()) {
    await Share.share({ title, text, dialogTitle: title });
    return 'shared';
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}
