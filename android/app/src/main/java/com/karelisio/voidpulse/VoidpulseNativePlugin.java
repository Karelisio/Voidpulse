package com.karelisio.voidpulse;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.Window;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pont natif de Voidpulse : informations de build, couleur d'accent Material You (Monet),
 * mode immersif, et mise à jour hors Play Store (flavor « github ») : téléchargement de l'APK
 * avec reprise (en-tête Range) et progression, vérification SHA-256, installation via
 * FileProvider + ACTION_VIEW, renvoi vers le réglage « Sources inconnues » si besoin.
 */
@CapacitorPlugin(name = "VoidpulseNative")
public class VoidpulseNativePlugin extends Plugin {

    private static final int BUFFER = 64 * 1024;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    @PluginMethod
    public void buildInfo(PluginCall call) {
        JSObject out = new JSObject();
        out.put("flavor", BuildConfig.FLAVOR);
        out.put("updater", BuildConfig.UPDATER);
        out.put("versionName", BuildConfig.VERSION_NAME);
        out.put("versionCode", BuildConfig.VERSION_CODE);
        out.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    /** Couleur graine de Material You (Android 12+), sinon null. */
    @PluginMethod
    public void systemAccent(PluginCall call) {
        JSObject out = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int color = getContext().getResources().getColor(android.R.color.system_accent1_500, getContext().getTheme());
            out.put("accent", String.format(Locale.ROOT, "#%06x", color & 0xffffff));
        } else {
            out.put("accent", (String) null);
        }
        call.resolve(out);
    }

    /** Plein écran : barres système masquées, réaffichées brièvement par un glissement. */
    @PluginMethod
    public void setImmersive(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(window, window.getDecorView());
            if (enabled) {
                c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                c.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                c.show(WindowInsetsCompat.Type.systemBars());
            }
            call.resolve();
        });
    }

    /**
     * Télécharge `url` vers le cache (« updates/ »), en reprenant un fichier partiel ; émet
     * « downloadProgress » { received, total } ; vérifie le SHA-256 attendu.
     */
    @PluginMethod
    public void download(PluginCall call) {
        if (!BuildConfig.UPDATER) {
            call.reject("Mise à jour intégrée indisponible dans cette version", "UNAVAILABLE");
            return;
        }
        String url = call.getString("url");
        String name = call.getString("fileName", "update.apk");
        String expected = call.getString("sha256", "");
        if (url == null || !url.startsWith("https://") || name.contains("/") || !expected.matches("[0-9a-fA-F]{64}")) {
            call.reject("Paramètres invalides", "INVALID");
            return;
        }
        cancelled.set(false);
        call.setKeepAlive(true);
        io.execute(() -> {
            File dir = new File(getContext().getCacheDir(), "updates");
            if (!dir.exists() && !dir.mkdirs()) {
                finish(call, null, "Dossier de téléchargement inaccessible");
                return;
            }
            File part = new File(dir, name + ".part");
            File done = new File(dir, name);
            try {
                if (done.exists() && matches(done, expected)) {
                    finish(call, done, null);
                    return;
                }
                fetch(url, part);
                if (cancelled.get()) {
                    finish(call, null, "Téléchargement annulé");
                    return;
                }
                if (!matches(part, expected)) {
                    if (!part.delete()) part.deleteOnExit();
                    finish(call, null, "Empreinte SHA-256 invalide");
                    return;
                }
                if (done.exists() && !done.delete()) throw new IOException("Ancien fichier verrouillé");
                if (!part.renameTo(done)) throw new IOException("Renommage impossible");
                finish(call, done, null);
            } catch (Exception e) {
                finish(call, null, e.getMessage() != null ? e.getMessage() : e.toString());
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled.set(true);
        call.resolve();
    }

    private void fetch(String url, File part) throws IOException {
        for (int redirects = 0; redirects < 6; redirects++) {
            long have = part.exists() ? part.length() : 0;
            HttpURLConnection http = (HttpURLConnection) new URL(url).openConnection();
            http.setInstanceFollowRedirects(false);
            http.setConnectTimeout(15000);
            http.setReadTimeout(30000);
            http.setRequestProperty("Accept", "application/octet-stream");
            if (have > 0) http.setRequestProperty("Range", "bytes=" + have + "-");
            int code = http.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = http.getHeaderField("Location");
                http.disconnect();
                if (next == null) throw new IOException("Redirection sans destination");
                url = new URL(new URL(url), next).toString();
                continue;
            }
            if (code == 416) {
                // Fichier déjà complet côté serveur.
                http.disconnect();
                return;
            }
            boolean resume = code == 206;
            if (code != 200 && !resume) {
                http.disconnect();
                throw new IOException("HTTP " + code);
            }
            if (!resume) have = 0;
            long length = http.getContentLengthLong();
            long total = length >= 0 ? have + length : -1;
            try (InputStream in = http.getInputStream(); OutputStream out = new FileOutputStream(part, resume)) {
                byte[] buf = new byte[BUFFER];
                long received = have;
                long lastEmit = 0;
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (cancelled.get()) return;
                    out.write(buf, 0, n);
                    received += n;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit > 150) {
                        lastEmit = now;
                        progress(received, total);
                    }
                }
                progress(received, total);
            } finally {
                http.disconnect();
            }
            return;
        }
        throw new IOException("Trop de redirections");
    }

    private void progress(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received);
        p.put("total", total);
        notifyListeners("downloadProgress", p);
    }

    private static boolean matches(File file, String expected) throws Exception {
        return sha256(file).equalsIgnoreCase(expected.trim());
    }

    private static String sha256(File file) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(file)) {
            byte[] buf = new byte[BUFFER];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    private void finish(PluginCall call, File file, String error) {
        if (error != null) {
            call.reject(error);
        } else {
            JSObject out = new JSObject();
            out.put("path", file.getAbsolutePath());
            call.resolve(out);
        }
        call.setKeepAlive(false);
        getBridge().releaseCall(call);
    }

    /** L'application peut-elle installer des paquets (Android 8+ : autorisation par application) ? */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject out = new JSObject();
        boolean allowed = BuildConfig.UPDATER
            && (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls());
        out.put("allowed", allowed);
        call.resolve(out);
    }

    /** Ouvre le réglage « Installer des applis inconnues » de Voidpulse. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    /** Lance l'installeur système sur l'APK téléchargé (dans le cache « updates/ »). */
    @PluginMethod
    public void install(PluginCall call) {
        if (!BuildConfig.UPDATER) {
            call.reject("Mise à jour intégrée indisponible dans cette version", "UNAVAILABLE");
            return;
        }
        String path = call.getString("path");
        File dir = new File(getContext().getCacheDir(), "updates");
        File file = path != null ? new File(path) : null;
        try {
            if (file == null || !file.exists() || !file.getCanonicalPath().startsWith(dir.getCanonicalPath())) {
                call.reject("Fichier introuvable", "NOT_FOUND");
                return;
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : e.toString());
        }
    }
}
