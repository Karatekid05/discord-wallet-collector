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

async function callWithRetry(requestFn, description = 'Sheets API call') {
	const maxAttempts = 5;
	let attempt = 0;
	let delayMs = 1000;
	while (true) {
		try {
			return await requestFn();
		} catch (err) {
			attempt++;
			const status = err?.code || err?.status || err?.response?.status || err?.cause?.code;
			const isRateLimited = status === 429 || err?.cause?.status === 'RESOURCE_EXHAUSTED';
			if (!isRateLimited || attempt >= maxAttempts) {
				throw err;
			}
			await new Promise((r) => setTimeout(r, delayMs + Math.floor(Math.random() * 250)));
			delayMs = Math.min(delayMs * 2, 15000);
		}
	}
}

export async function ensureSheetSetup() {
	// Ensure sheet exists and has header row
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	// Try to get sheet by name
	const spreadsheet = await callWithRetry(() => sheetsApi.spreadsheets.get({ spreadsheetId }), 'spreadsheets.get');
	const sheetExists = spreadsheet.data.sheets?.some(
		(s) => s.properties?.title === SHEET_NAME
	);
	if (!sheetExists) {
		await callWithRetry(() => sheetsApi.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{ addSheet: { properties: { title: SHEET_NAME } } },
				],
			},
		}), 'spreadsheets.batchUpdate');
	}
	// Write header row if first row is empty
	const range = `${SHEET_NAME}!A1:D1`;
	const current = await callWithRetry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId, range }), 'values.get header');
	const firstRow = current.data.values?.[0] ?? [];
	if (firstRow.length === 0 || HEADER_ROW.some((h, i) => firstRow[i] !== h)) {
		await callWithRetry(() => sheetsApi.spreadsheets.values.update({
			spreadsheetId,
			range,
			valueInputOption: 'RAW',
			requestBody: { values: [HEADER_ROW] },
		}), 'values.update header');
	}
}

export async function upsertWallet({ discordId, discordUsername, wallet, role }) {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`; // data rows
	const resp = await callWithRetry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId, range }), 'values.get upsert');
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
		await callWithRetry(() => sheetsApi.spreadsheets.values.append({
			spreadsheetId,
			range,
			valueInputOption: 'RAW',
			insertDataOption: 'INSERT_ROWS',
			requestBody: {
				values: [[discordUsername, discordId, wallet, role ?? '']],
			},
		}), 'values.append upsert');
		return { action: 'inserted' };
	}

	// update existing row
	const updateRange = `${SHEET_NAME}!A${rowIndex + 2}:D${rowIndex + 2}`;
	await callWithRetry(() => sheetsApi.spreadsheets.values.update({
		spreadsheetId,
		range: updateRange,
		valueInputOption: 'RAW',
		requestBody: {
			values: [[discordUsername, discordId, wallet, role ?? '']],
		},
	}), 'values.update upsert');
	return { action: 'updated' };
}

export async function getWallet(discordId) {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`;
	const resp = await callWithRetry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId, range }), 'values.get getWallet');
	const rows = resp.data.values || [];
	for (const row of rows) {
		if (row[1] === discordId) {
			return { discordUsername: row[0], discordId: row[1], wallet: row[2], role: row[3] ?? '' };
		}
	}
	return null;
}

export async function listWallets() {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`;
	const resp = await callWithRetry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId, range }), 'values.get list');
	const rows = resp.data.values || [];
	const items = [];
	for (const row of rows) {
		if (!row || row.length === 0) continue;
		items.push({
			discordUsername: row[0] ?? '',
			discordId: row[1] ?? '',
			wallet: row[2] ?? '',
			role: row[3] ?? '',
		});
	}
	return items;
}

export async function listWalletsWithRow() {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`;
	const resp = await callWithRetry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId, range }), 'values.get listWithRow');
	const rows = resp.data.values || [];
	const items = [];
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i] || [];
		if (row.length === 0) continue;
		items.push({
			rowNumber: i + 2, // actual sheet row number
			discordUsername: row[0] ?? '',
			discordId: row[1] ?? '',
			wallet: row[2] ?? '',
			role: row[3] ?? '',
		});
	}
	return items;
}

export async function updateRole(discordId, role) {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const range = `${SHEET_NAME}!A2:D`;
	const resp = await callWithRetry(() => sheetsApi.spreadsheets.values.get({ spreadsheetId, range }), 'values.get updateRole');
	const rows = resp.data.values || [];

	let rowIndex = -1;
	for (let i = 0; i < rows.length; i++) {
		if (rows[i][1] === discordId) {
			rowIndex = i;
			break;
		}
	}
	if (rowIndex === -1) return false;

	const updateRange = `${SHEET_NAME}!D${rowIndex + 2}:D${rowIndex + 2}`;
	await callWithRetry(() => sheetsApi.spreadsheets.values.update({
		spreadsheetId,
		range: updateRange,
		valueInputOption: 'RAW',
		requestBody: {
			values: [[role ?? '']],
		},
	}), 'values.update role');
	return true;
}

export async function batchUpdateRoles(updates) {
	if (!Array.isArray(updates) || updates.length === 0) return { updated: 0 };
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	const data = updates.map((u) => ({
		range: `${SHEET_NAME}!D${u.rowNumber}:D${u.rowNumber}`,
		values: [[u.role ?? '']],
	}));
	await callWithRetry(() => sheetsApi.spreadsheets.values.batchUpdate({
		spreadsheetId,
		requestBody: {
			valueInputOption: 'RAW',
			data,
		},
	}), 'values.batchUpdate roles');
	return { updated: updates.length };
}

export async function batchDeleteRows(rowNumbers) {
	await ensureSheetSetup();
	const spreadsheetId = GOOGLE_SHEETS_SPREADSHEET_ID;
	
	// Get the sheet ID for "Wallets"
	const spreadsheet = await callWithRetry(() => sheetsApi.spreadsheets.get({ spreadsheetId }), 'spreadsheets.get for sheetId');
	const sheet = spreadsheet.data.sheets?.find((s) => s.properties?.title === SHEET_NAME);
	if (!sheet || !sheet.properties?.sheetId) {
		throw new Error(`Sheet "${SHEET_NAME}" not found`);
	}
	const sheetId = sheet.properties.sheetId;
	
	const sorted = Array.from(new Set(rowNumbers.filter((n) => Number.isInteger(n) && n >= 2))).sort((a,b) => b - a);
	if (sorted.length === 0) return { deleted: 0 };
	
	// Process in batches of 50 to avoid API limits
	const batchSize = 50;
	let totalDeleted = 0;
	for (let i = 0; i < sorted.length; i += batchSize) {
		const batch = sorted.slice(i, i + batchSize);
		const requests = batch.map((rowNumber) => ({
			deleteDimension: {
				range: {
					sheetId: sheetId,
					dimension: 'ROWS',
					startIndex: rowNumber - 1, // 0-based
					endIndex: rowNumber,      // exclusive
				},
			},
		}));
		await callWithRetry(() => sheetsApi.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: { requests },
		}), 'spreadsheets.batchUpdate deleteRows');
		totalDeleted += batch.length;
	}
	return { deleted: totalDeleted };
}


