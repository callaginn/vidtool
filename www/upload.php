<?php
	require_once 'bin/Helpers.php';
	require_once 'bin/ShellUtility.php';
	require_once 'bin/FfmpegWrapper.php';

	set_time_limit(3600);
	ignore_user_abort(true);

	@ini_set('output_buffering', '0');
	@ini_set('zlib.output_compression', '0');
	while (ob_get_level() > 0) ob_end_flush();
	ob_implicit_flush(true);

	header('Content-Type: application/json-seq; charset=utf-8');
	header('Cache-Control: no-cache');
	header('X-Accel-Buffering: no');

	$startTime = microtime(true);

	// Logging function (defined before try/catch so it's available in the catch block)
	if (!function_exists('stream_event')) {
		function stream_event(array $data): void {
			try {
				$dt = DateTime::createFromFormat('U.u', sprintf('%.6F', microtime(true)), new DateTimeZone('UTC'));
				$data['ts'] = $dt ? $dt->format('Y-m-d\TH:i:s.u\Z') : gmdate('c');
			} catch (Throwable $e) {
				$data['ts'] = gmdate('c');
			}
			send_json($data);
		}
	}

	try {
		$shellUtility = new ShellUtility();
		$ffmpeg = $shellUtility->findCommand('ffmpeg');

		if (!isset($_FILES['video_file']) || $_FILES['video_file']['error'] !== UPLOAD_ERR_OK) {
			throw new Exception('No file uploaded or there was an upload error.');
		}

		$inputFilename = $_FILES['video_file']['tmp_name'];
		if (!file_exists($inputFilename)) {
			throw new Exception("Uploaded file does not exist: $inputFilename");
		}
		validateMimeType($inputFilename);
	$safeInputFilename = escapeshellarg($inputFilename);

		$outputDir = 'uploads/';
		if (!is_dir($outputDir)) mkdir($outputDir, 0755, true);
		$outputBasePath = rtrim(realpath($outputDir), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
		$outputBaseName = preg_replace('/\.mp4$/', '', sanitizeFilename($_POST['output_filename'] ?? 'output.mp4'));

		// Config: outputs define maps and filters
		$ffmpegConfig = (object) [
			'width'   => sanitizeWidth($_POST['width'] ?? 1280),
			'filters' => [
				"[0:v]scale=%width%:-2[vscaled]" // base scaling
			],
			'outputs' => [
				'placeholder' => [
					'filter' => 'fps=1', // extra filter for thumbnail
					'params' => [
						'-vframes 1',
						'-q:v 1',
						'-update 1'
					],
					'ext'    => 'jpg'
				],
				'webm' => [
					'params' => [
						'-c:v libvpx',
						'-crf 4',
						'-b:v 1M',
						'-an'
					],
					'ext'    => 'webm'
				],
				'mp4' => [
					'params' => [
						'-c:v libx264',
						'-pix_fmt yuv420p',
						'-profile:v baseline',
						'-level 4.0',
						'-crf 22',
						'-preset fast',
						'-movflags +faststart',
						'-an'
					],
					'ext' => 'mp4'
				]
			]
		];

		// Build filter graph dynamically
		$splitLabels = [];
		$outputIndex = 0;
		foreach ($ffmpegConfig->outputs as $name => &$output) {
			$output['map_label'] = "[v{$name}]";
			$splitLabels[] = $output['map_label'];
		}
		unset($output);

		// Insert split step after scaling
		$ffmpegConfig->filters[] = "[vscaled]split=" . count($splitLabels) . implode('', $splitLabels);

		// Add per-output extra filters if defined
		foreach ($ffmpegConfig->outputs as $name => &$output) {
			if (!empty($output['filter'])) {
				$output['final_map'] = "[v{$name}_out]";
				$ffmpegConfig->filters[] = "{$output['map_label']}{$output['filter']}{$output['final_map']}";
			} else {
				$output['final_map'] = $output['map_label'];
			}
			$output['path'] = escapeshellarg($outputBasePath . $outputBaseName . '.' . $output['ext']);
		}
		unset($output);

		// Replace placeholders
		foreach ($ffmpegConfig->filters as &$filter) {
			$filter = str_replace('%width%', $ffmpegConfig->width, $filter);
		}
		unset($filter);

		$filterComplex = implode('; ', $ffmpegConfig->filters);

		// Build ffmpeg command
		$commandParts = [
			"$ffmpeg -y -i $safeInputFilename -threads 0 -progress pipe:2 -filter_complex " . escapeshellarg($filterComplex)
		];
		foreach ($ffmpegConfig->outputs as $output) {
			$commandParts[] = "-map \"{$output['final_map']}\" " . implode(' ', $output['params']) . " {$output['path']}";
		}
		$command = implode(' ', $commandParts);

		// Run ffmpeg
		$logDir = sys_get_temp_dir();
		$stderrLogPath = $logDir . '/ffmpeg-stderr-' . date('Ymd-His') . '-' . getmypid() . '.log';
		$stderrLog = fopen($stderrLogPath, 'w');
		if ($stderrLog === false) {
			error_log("Failed to open stderr log file: $stderrLogPath");
			$stderrLog = null;
		}

		$descriptorspec = [
			0 => ['pipe', 'r'],
			1 => ['pipe', 'w'],
			2 => ['pipe', 'w']
		];
		$process = proc_open($command, $descriptorspec, $pipes);
		if (!is_resource($process)) throw new Exception('Could not start ffmpeg process.');
		fclose($pipes[0]);

		stream_event(['type' => 'log', 'line' => $command]);

		if (isset($pipes[1])) stream_set_blocking($pipes[1], false);
		if (isset($pipes[2])) stream_set_blocking($pipes[2], false);

		$totalDuration = 0;
		$buffer = '';
		$lastProgressSentAt = 0.0;

		while (true) {
			$status = proc_get_status($process);
			$stdoutEof = !(isset($pipes[1]) && is_resource($pipes[1])) || feof($pipes[1]);
			$stderrEof = !(isset($pipes[2]) && is_resource($pipes[2])) || feof($pipes[2]);
			if (!$status['running'] && $stdoutEof && $stderrEof) break;

			$read = [];
			if (isset($pipes[1]) && is_resource($pipes[1])) $read[] = $pipes[1];
			if (isset($pipes[2]) && is_resource($pipes[2])) $read[] = $pipes[2];

			if (stream_select($read, $write, $except, 1) > 0) {
				foreach ($read as $pipe) {
					$data = fread($pipe, 8192);
					if ($data === false || $data === '') continue;
					if ($stderrLog && $pipe === $pipes[2]) {
						fwrite($stderrLog, $data);
					}

					$buffer .= $data;
					while (($pos = strpos($buffer, "\n")) !== false || ($pos = strpos($buffer, "\r")) !== false) {
						$line = substr($buffer, 0, $pos);
						$buffer = substr($buffer, $pos + 1);

						stream_event(['type' => 'log', 'line' => htmlspecialchars($line)]);

						if ($totalDuration == 0 && preg_match('/Duration: ([\d:.]+)/', $line, $matches)) {
							$totalDuration = timeToSeconds($matches[1]);
							stream_event(['type' => 'duration', 'value' => $totalDuration]);
						}

						if (trim($line) === 'progress=end') {
							stream_event(['type' => 'progress', 'time' => $totalDuration ?: null, 'percent' => 100]);
						}

						$now = microtime(true);
						if ($totalDuration > 0 && preg_match('/(out_time|time)=([\d:.]+)/', $line, $m2)) {
							$currentTime = timeToSeconds($m2[2]);
							if ($now - $lastProgressSentAt >= 0.2) {
								$percent = min(100, max(0, round(($currentTime / $totalDuration) * 100)));
								stream_event(['type' => 'progress', 'time' => $currentTime, 'percent' => $percent]);
								$lastProgressSentAt = $now;
							}
						}
					}
				}
			}
		}

		$return_value = proc_close($process);

		if ($stderrLog) {
			fclose($stderrLog);
			error_log("FFmpeg stderr log saved to: $stderrLogPath");
		}

		if ($return_value !== 0) {
			$allOk = true;
			foreach ($ffmpegConfig->outputs as $output) {
				$filePath = trim($output['path'], "'\"");
				if (!file_exists($filePath) || filesize($filePath) <= 0) {
					$allOk = false;
					break;
				}
			}
			if (!$allOk) {
				error_log("ffmpeg process failed with exit code $return_value. Stderr log: $stderrLogPath");
				throw new Exception("ffmpeg failed with return code: $return_value");
			}
		}

		$endTime = microtime(true);
		$duration = round($endTime - $startTime, 2);
		stream_event(['type' => 'log', 'line' => "Total processing time: {$duration}s"]);

		$links = [];
		foreach ($ffmpegConfig->outputs as $label => $output) {
			$links[] = [
				'name' => ucfirst($label),
				'url'  => "uploads/{$outputBaseName}.{$output['ext']}"
			];
		}
		stream_event(['type' => 'done', 'links' => $links]);

	} catch (Exception $e) {
		$elapsedErr = round(microtime(true) - $startTime, 2);
		stream_event(['type' => 'log', 'line' => "Elapsed before error: {$elapsedErr}s"]);
		stream_event(['type' => 'error', 'message' => 'An error occurred: ' . $e->getMessage()]);
		error_log($e->getMessage());
	}
?>
