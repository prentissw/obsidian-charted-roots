/**
 * Error handling utilities
 *
 * Provides type-safe error message extraction for catch blocks.
 */

/**
 * Extracts an error message from an unknown error value.
 * Handles Error instances, strings, and other types safely.
 *
 * @param error - The error value caught in a catch block
 * @returns A string message describing the error
 */
export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	return String(error);
}
