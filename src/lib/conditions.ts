import { writable } from 'svelte/store';

export interface Conditions {
	latitude: number;
	longitude: number;
	/** Null when the weather lookup failed, so a recorded position is never discarded with it. */
	weather: WeatherSnapshot | null;
	/** Nearest town, which is what an archer recognises. Coordinates stay stored for the lookup. */
	place: string | null;
}

export interface WeatherSnapshot {
	temperatureC: number;
	windSpeedKmh: number;
	windDirectionDeg: number;
	code: number;
	fetchedAt: number;
}

function flag(key: string, initial = false) {
	// An absent key means the preference was never set, which is not the same as it being off.
	const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(key);
	const store = writable<boolean>(saved === null ? initial : saved === 'true');
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, String(value));
	});
	return store;
}

/** Opt in, off by default: nothing asks for location until the archer turns this on. */
export const autoLocation = flag('appchery.autoLocation');

/** Weather is derived from coordinates, so it is only meaningful while location is on. */
export const autoWeather = flag('appchery.autoWeather');

/**
 * Naming the place sends coordinates to a third party, which recording them locally does not.
 * That is a separate decision from switching location on, so it gets its own opt in.
 */
export const autoPlaceName = flag('appchery.autoPlaceName');

export class LocationDeniedError extends Error {}

export async function requestPosition(): Promise<GeolocationPosition> {
	if (!('geolocation' in navigator)) throw new LocationDeniedError('Geolocation unavailable');
	return new Promise((resolve, reject) => {
		navigator.geolocation.getCurrentPosition(
			resolve,
			(error) => reject(new LocationDeniedError(error.message)),
			{ enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
		);
	});
}

/**
 * Open-Meteo needs no API key and no account, which keeps the app installable and self-hostable.
 * Wind matters more than temperature to an archer, so both are recorded.
 */
export async function fetchWeather(
	latitude: number,
	longitude: number
): Promise<WeatherSnapshot | null> {
	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}` +
		`&longitude=${longitude.toFixed(3)}&current=temperature_2m,wind_speed_10m,wind_direction_10m,weather_code`;

	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const data = await response.json();
		const current = data?.current;
		if (!current) return null;
		return {
			temperatureC: current.temperature_2m,
			windSpeedKmh: current.wind_speed_10m,
			windDirectionDeg: current.wind_direction_10m,
			code: current.weather_code,
			fetchedAt: Date.now()
		};
	} catch {
		// Offline is the normal case at a range, so a failed lookup must never block the session.
		return null;
	}
}

export async function captureConditions(
	withWeather = true,
	withPlaceName = false
): Promise<Conditions> {
	const position = await requestPosition();
	const { latitude, longitude } = position.coords;
	const [weather, place] = await Promise.all([
		withWeather ? fetchWeather(latitude, longitude) : Promise.resolve(null),
		withPlaceName ? fetchPlace(latitude, longitude) : Promise.resolve(null)
	]);
	return { latitude, longitude, weather, place };
}

/** Reverse geocoding with no key and no account, so the app stays installable and self-hostable. */
export async function fetchPlace(latitude: number, longitude: number): Promise<string | null> {
	const url =
		`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude.toFixed(4)}` +
		`&longitude=${longitude.toFixed(4)}&localityLanguage=en`;
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const data = await response.json();
		const town = data?.city || data?.locality || data?.principalSubdivision;
		return town ? [town, data?.countryCode].filter(Boolean).join(', ') : null;
	} catch {
		return null;
	}
}

export function formatTemperature(snapshot: WeatherSnapshot): string {
	return `${Math.round(snapshot.temperatureC)}°C`;
}

export function formatWind(snapshot: WeatherSnapshot): string {
	return `${Math.round(snapshot.windSpeedKmh)} km/h ${compass(snapshot.windDirectionDeg)}`;
}

/** Wind direction matters more to an archer than the exact bearing, so it reads as a compass point. */
function compass(degrees: number): string {
	const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return points[Math.round(degrees / 45) % 8];
}

export type WeatherIcon = 'sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm';

/** WMO weather codes, grouped down to the handful of icons worth drawing. */
export function weatherIcon(code: number): WeatherIcon {
	if (code === 0 || code === 1) return 'sun';
	if (code === 45 || code === 48) return 'fog';
	if (code >= 95) return 'storm';
	if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
	if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
	return 'cloud';
}

export function weatherLabelKey(code: number): string {
	return `weather.${weatherIcon(code)}`;
}
