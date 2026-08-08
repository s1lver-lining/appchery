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

function flag(key: string, initial = false) {
	const store = writable<boolean>(
		typeof window === 'undefined' ? initial : window.localStorage.getItem(key) === 'true'
	);
	store.subscribe((value) => {
		if (typeof window !== 'undefined') window.localStorage.setItem(key, String(value));
	});
	return store;
}

/** Opt in, off by default: nothing asks for location until the archer turns this on. */
export const autoLocation = flag('appchery.autoLocation');

/** Weather is derived from coordinates, so it is only meaningful while location is on. */
export const autoWeather = flag('appchery.autoWeather');

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

export async function captureConditions(withWeather = true): Promise<Conditions> {
	const position = await requestPosition();
	const { latitude, longitude } = position.coords;
	return {
		latitude,
		longitude,
		weather: withWeather ? await fetchWeather(latitude, longitude) : null
	};
}

export function formatWeather(snapshot: WeatherSnapshot): string {
	return `${Math.round(snapshot.temperatureC)}°C, ${Math.round(snapshot.windSpeedKmh)} km/h`;
}
