import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const {
	GOOGLE_SHEETS_SPREADSHEET_ID,
	GOOGLE_SERVICE_ACCOUNT_EMAIL,
	GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
} = process.env;

if (!GOOGLE_SHEETS_SPREADSHEET_ID) {
	throw new Error('Missing GOOGLE_SHEETS_SPREADSHEET_ID in environment.');
}
if (!GOOGLE_SERVICE_ACCOUNT_EMAIL) {
	throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL in environment.');
}
if (!GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
	throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in environment.');
}

// Support both raw and \n-escaped private keys
const privateKey = GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');

const auth = new google.auth.JWT({
	email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
	key: privateKey,
	scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheetsApi = google.sheets({ version: 'v4', auth });

const SHEET_NAME = 'Wallets';
const HEADER_ROW = ['Discord Username', 'Discord ID', 'EVM Wallet', 'Role'];

export async function ensureSheetSetup() {
	// Ensure sheet exists and has header row
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	// Try to get sheet by name
	const spreadsheet = await sheetsApi.spreadsheets.get({ spreadsheetId });
	const sheetExists = spreadsheet.data.sheets?.some(
		(s) => s.properties?.title === SHEET_NAME
	);
	if (!sheetExists) {
		await sheetsApi.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{ addSheet: { properties: { title: SHEET_NAME } } },
				],
			},
		});
	}
	// Write header row if first row is empty
	const range = `${SHEET_NAME}!A1:D1`;
	const current = await sheetsApi.spreadsheets.values.get({ spreadsheetId, range });
	const firstRow = current.data.values?.[0] ?? [];
	if (firstRow.length === 0 || HEADER_ROW.some((h, i) => firstRow[i] !== h)) {
		await sheetsApi.spreadsheets.values.update({
			spreadsheetId,
			range,
			valueInputOption: 'RAW',
			requestBody: { values: [HEADER_ROW] },
		});
	}
}

export async function upsertWallet({ discordId, discordUsername, wallet, role }) {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`; // data rows
	const resp = await sheetsApi.spreadsheets.values.get({ spreadsheetId, range });
	const rows = resp.data.values || [];

	let rowIndex = -1; // 0-based within rows (A2 is index 0)
	for (let i = 0; i < rows.length; i++) {
		if (rows[i][1] === discordId) {
			rowIndex = i;
			break;
		}
	}

	if (rowIndex === -1) {
		// append
		await sheetsApi.spreadsheets.values.append({
			spreadsheetId,
			range,
			valueInputOption: 'RAW',
			insertDataOption: 'INSERT_ROWS',
			requestBody: {
				values: [[discordUsername, discordId, wallet, role ?? '']],
			},
		});
		return { action: 'inserted' };
	}

	// update existing row
	const updateRange = `${SHEET_NAME}!A${rowIndex + 2}:D${rowIndex + 2}`;
	await sheetsApi.spreadsheets.values.update({
		spreadsheetId,
		range: updateRange,
		valueInputOption: 'RAW',
		requestBody: {
			values: [[discordUsername, discordId, wallet, role ?? '']],
		},
	});
	return { action: 'updated' };
}

export async function getWallet(discordId) {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`;
	const resp = await sheetsApi.spreadsheets.values.get({ spreadsheetId, range });
	const rows = resp.data.values || [];
	for (const row of rows) {
		if (row[1] === discordId) {
			return { discordUsername: row[0], discordId: row[1], wallet: row[2], role: row[3] ?? '' };
		}
	}
	return null;
}


