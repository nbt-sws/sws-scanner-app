// src/native.js
// Tiny helper: when running inside Capacitor (iOS / Android), prefer the
// native Camera plugin over the browser <input type="file">. The Scanner
// screen calls into this if available; otherwise it falls back to the
// HTML file input, which works fine on web.

let CameraModule = null;

async function getCamera() {
  if (CameraModule !== null) return CameraModule;
  try {
    // Dynamically import so the web build doesn't choke when native plugins
    // are absent at module-eval time. We use Function('return import(...)')
    // so the webpack static analyzer doesn't try to resolve @capacitor/camera
    // at build time (it isn't installed by default in CRA dev environments).
    const dyn = new Function('m', 'return import(m)');
    const mod = await dyn('@capacitor/camera');
    CameraModule = mod;
  } catch {
    CameraModule = false;
  }
  return CameraModule;
}

export function isNative() {
  // Capacitor sets window.Capacitor.isNativePlatform() — fall back to false.
  // eslint-disable-next-line no-undef
  try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); }
  catch { return false; }
}

// Returns a data-URL string or null on cancel/error.
export async function takeNativePhoto() {
  const Camera = await getCamera();
  if (!Camera) return null;
  try {
    const { Camera: CameraApi, CameraResultType, CameraSource } = Camera;
    const photo = await CameraApi.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
    });
    return photo.dataUrl || null;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Native camera failed, falling back:', e?.message);
    return null;
  }
}
