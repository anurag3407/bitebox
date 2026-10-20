import type { Coordinate } from "@startup/contracts";

export function getCurrentPosition(options: PositionOptions = {}): Promise<Coordinate & { accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not supported on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) =>
        reject(
          new Error(
            err.code === err.PERMISSION_DENIED
              ? "Location permission was denied. Enable it in your browser settings or search for your area."
              : "We could not detect your location. Please try again or search for your area."
          )
        ),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000, ...options }
    );
  });
}

/** Google Maps directions deep link (opens the native app on phones). */
export function directionsUrl(to: Coordinate): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}&travelmode=two-wheeler`;
}
