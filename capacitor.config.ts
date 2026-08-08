import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.appchery.app',
	appName: 'Appchery',
	webDir: 'build',
	// Native SQLite is provided by the platform, not the webview, so nothing
	// here needs the OPFS/cross-origin-isolation dance the browser build does.
	plugins: {
		CapacitorSQLite: {
			iosDatabaseLocation: 'Library/CapacitorDatabase',
			iosIsEncryption: false,
			androidIsEncryption: false
		}
	}
};

export default config;
