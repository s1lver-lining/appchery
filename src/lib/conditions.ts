import { writable } from 'svelte/store';

export interface Conditions {
	latitude: number;
	longitude: number;
	/** Null when the weather lookup failed, so a recorded position is never discarded with it. */
	weather: WeatherSnapshot | null;
}

export interface WeatherSnapshot {
	temperatureC: number;
	windSpeedKmh: number;
	windDirectionDeg: number;
	code: number;
	fetchedAt: number;
}

const STORAGE_KEY = 'appchery.autoConditions';

function stored(): boolean {
	if (typeof window === 'undefined') return false;
	return window.localStorage.getItem(STORAGE_KEY) === 'true';
}

/** Opt in, off by default: nothing asks for location until the archer turns this on. */
export const autoConditions = writable<boolean>(stored());

autoConditions.subscribe((value) => {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, String(value));
});

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

export async function captureConditions(): Promise<Conditions> {
	const position = await requestPosition();
	const { latitude, longitude } = position.coords;
	return { latitude, longitude, weather: await fetchWeather(latitude, longitude) };
}

export function formatWeather(snapshot: WeatherSnapshot): string {
	return `${Math.round(snapshot.temperatureC)}°C, ${Math.round(snapshot.windSpeedKmh)} km/h`;
}
