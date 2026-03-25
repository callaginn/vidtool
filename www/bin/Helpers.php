<?php
	// Function to sanitize and validate width
	function sanitizeWidth(string $width): int {
		if (!ctype_digit($width) || (int)$width <= 0) {
			throw new Exception('Error: Width must be a positive integer.');
		}
		return (int)$width;
	}
	
	// Function to validate and sanitize a filename
	function sanitizeFilename(string $filename): string {
		// Strip any dangerous characters and keep it simple
		$sanitized = preg_replace('/[^a-zA-Z0-9\._-]/', '', $filename);
		if (empty($sanitized) || preg_match('/\.\./', $sanitized)) {
			throw new Exception('Error: Invalid filename.');
		}
		return $sanitized;
	}
	
	// Function to validate MIME type of uploaded file
	function validateMimeType(string $filePath, array $allowedTypes = []): void {
		if (empty($allowedTypes)) {
			$allowedTypes = [
				'video/mp4',
				'video/x-m4v',
				'video/quicktime',
				'video/avi',
				'video/x-matroska',
				'video/webm',
			];
		}
		$finfo = finfo_open(FILEINFO_MIME_TYPE);
		$mimeType = finfo_file($finfo, $filePath);
		finfo_close($finfo);
		if (!in_array($mimeType, $allowedTypes, true)) {
			throw new Exception("Error: Unsupported file type ($mimeType). Only video files are allowed.");
		}
	}

	// --- Helper Functions ---

	/**
	 * Sends a JSON-encoded message to the client, followed by a newline.
	 * @param array $data The data to send.
	 */
	function send_json(array $data): void {
		echo json_encode($data) . "\n";
		flush();
	}

	/**
	 * Converts HH:MM:SS.ms time format to seconds.
	 * @param string $timeStr The time string from ffmpeg.
	 * @return float Total seconds.
	 */
	function timeToSeconds(string $timeStr): float {
		if (preg_match('/(\d{2}):(\d{2}):(\d{2})\.(\d{2,})/', $timeStr, $matches)) {
			return ((int)$matches[1] * 3600) + ((int)$matches[2] * 60) + (int)$matches[3] + (float)("0." . $matches[4]);
		}
		return 0.0;
	}
?>