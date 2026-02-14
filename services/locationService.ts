
/**
 * FarmoLink Geolocation Service
 */

export type GeoPosition = { lat: number; lng: number; accuracy?: number };

const getBrowserPosition = (options: PositionOptions): Promise<GeoPosition | null> => {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            }),
            () => resolve(null),
            options
        );
    });
};

export const getCurrentPosition = async (): Promise<GeoPosition | null> => {
    const precise = await getBrowserPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });

    if (precise && (precise.accuracy ?? Number.POSITIVE_INFINITY) <= 80) {
        return precise;
    }

    const fallback = await getBrowserPosition({
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 120000
    });

    if (precise && fallback) {
        const preciseAcc = precise.accuracy ?? Number.POSITIVE_INFINITY;
        const fallbackAcc = fallback.accuracy ?? Number.POSITIVE_INFINITY;
        return preciseAcc <= fallbackAcc ? precise : fallback;
    }

    return precise || fallback;
};

/**
 * Calcula a distância entre dois pontos em KM (Fórmula de Haversine)
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Raio da Terra em KM
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const formatDistance = (km: number): string => {
    if (km < 1) return `${(km * 1000).toFixed(0)}m`;
    return `${km.toFixed(1)}km`;
};
