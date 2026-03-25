<?php
	/**
	 * FfmpegWrapper - A chainable PHP wrapper for FFmpeg
	 * 
	 * @author Stephen Ginn
	 * @copyright 2023 Stephen Ginn
	 * @license MIT
	 * @version 1.0
	 */
	
	class FfmpegWrapper {
		protected string $binary;
		protected array $inputs = [];
		protected array $outputs = [];
		protected array $globalOptions = [];
		protected array $filters = [];
		protected array $maps = [];
		protected array $metadata = [];
		protected array $env = [];
		protected ?int $lastExitCode = null;
		protected string $lastStdout = '';
		protected string $lastStderr = '';
		protected float $timeout = 0;
		
		public function __construct(?ShellUtility $shellUtility = null) {
			if ($shellUtility) {
				$this->binary = $shellUtility->findCommand('ffmpeg');
			} else {
				$this->binary = 'ffmpeg'; // fallback
			}
		}
		
		public function binary(string $path): self {
			$this->binary = $path;
			return $this;
		}
		
		public function addInput(string $path, array $opts = []): self {
			$this->inputs[] = ['path' => $path, 'opts' => $opts];
			return $this;
		}
		
		public function addOutput(string $path, array $opts = []): self {
			$this->outputs[] = ['path' => $path, 'opts' => $opts];
			return $this;
		}
		
		public function addGlobalOption(string $key, $value = null): self {
			$this->globalOptions[$key] = $value;
			return $this;
		}
		
		public function addFlag(string $flag): self {
			$this->globalOptions[$flag] = null;
			return $this;
		}
		
		public function addFilter(string $filter): self {
			$this->filters[] = $filter;
			return $this;
		}
		
		public function setFilterGraph(string $graph): self {
			$this->filters = [$graph];
			return $this;
		}
		
		public function addMap(string $mapSpec): self {
			$this->maps[] = $mapSpec;
			return $this;
		}
		
		public function addMetadata(string $key, string $value, ?int $outputIndex = null): self {
			if ($outputIndex === null) {
				$outputIndex = count($this->outputs) - 1;
			}
			$this->metadata[$outputIndex][$key] = $value;
			return $this;
		}
		
		public function setEnv(array $env): self {
			$this->env = $env;
			return $this;
		}
		
		public function setTimeout(float $seconds): self {
			$this->timeout = $seconds;
			return $this;
		}
		
		public function overwrite(): self { return $this->addFlag('-y'); }
		public function hideBanner(): self { return $this->addFlag('-hide_banner'); }
		public function videoCodec(string $codec): self { return $this->addGlobalOption('-c:v', $codec); }
		public function audioCodec(string $codec): self { return $this->addGlobalOption('-c:a', $codec); }
		
		public function buildCommandParts(): array {
			$parts = [$this->binary];
			foreach ($this->globalOptions as $k => $v) {
				$parts[] = $k;
				if ($v !== null) $parts[] = (string)$v;
			}
			foreach ($this->inputs as $input) {
				foreach ($input['opts'] as $k => $v) {
					if (is_int($k)) {
						$parts[] = $v;
					} else {
						$parts[] = $k;
						if ($v !== null) $parts[] = (string)$v;
					}
				}
				$parts[] = '-i';
				$parts[] = $input['path'];
			}
			if (!empty($this->filters)) {
				$parts[] = '-filter_complex';
				$parts[] = implode('; ', $this->filters);
			}
			foreach ($this->maps as $map) {
				$parts[] = '-map';
				$parts[] = $map;
			}
			foreach ($this->outputs as $idx => $output) {
				foreach ($output['opts'] as $k => $v) {
					if (is_int($k)) {
						$parts[] = $v;
					} else {
						$parts[] = $k;
						if ($v !== null) $parts[] = (string)$v;
					}
				}
				if (isset($this->metadata[$idx])) {
					foreach ($this->metadata[$idx] as $mkey => $mval) {
						$parts[] = '-metadata';
						$parts[] = "{$mkey}={$mval}";
					}
				}
				$parts[] = $output['path'];
			}
			return $parts;
		}
		
		public function getCommandString(): string {
			$parts = $this->buildCommandParts();
			$escaped = array_map(function($p) {
				if (is_string($p) && strlen($p) > 0 && $p[0] === '-') return $p;
				return escapeshellarg((string)$p);
			}, $parts);
			return implode(' ', $escaped);
		}
		
		public function run(?callable $outputCallback = null): int {
			$cmd = $this->getCommandString();
			$descriptors = [
				0 => ['pipe', 'r'],
				1 => ['pipe', 'w'],
				2 => ['pipe', 'w'],
			];
			$proc = proc_open($cmd, $descriptors, $pipes, null, $this->env);
			$this->lastStdout = '';
			$this->lastStderr = '';
			$this->lastExitCode = -1;
			if (!is_resource($proc)) {
				throw new RuntimeException("Failed to start process for command: {$cmd}");
			}
			stream_set_blocking($pipes[1], false);
			stream_set_blocking($pipes[2], false);
			fclose($pipes[0]);
			$start = microtime(true);
			while (true) {
				$status = proc_get_status($proc);
				$out = stream_get_contents($pipes[1]);
				$err = stream_get_contents($pipes[2]);
				if ($out !== '') {
					$this->lastStdout .= $out;
					if ($outputCallback) $outputCallback('out', $out);
				}
				if ($err !== '') {
					$this->lastStderr .= $err;
					if ($outputCallback) $outputCallback('err', $err);
				}
				if (!$status['running']) {
					$this->lastExitCode = $status['exitcode'];
					break;
				}
				if ($this->timeout > 0 && (microtime(true) - $start) > $this->timeout) {
					proc_terminate($proc);
					sleep(1);
					$status2 = proc_get_status($proc);
					if ($status2['running']) {
						proc_terminate($proc, 9);
					}
					$this->lastExitCode = -2;
					break;
				}
				usleep(100000);
			}
			$out = stream_get_contents($pipes[1]);
			$err = stream_get_contents($pipes[2]);
			if ($out !== '') {
				$this->lastStdout .= $out;
				if ($outputCallback) $outputCallback('out', $out);
			}
			if ($err !== '') {
				$this->lastStderr .= $err;
				if ($outputCallback) $outputCallback('err', $err);
			}
			fclose($pipes[1]);
			fclose($pipes[2]);
			$final = proc_close($proc);
			if ($this->lastExitCode === -1) {
				$this->lastExitCode = $final;
			}
			return $this->lastExitCode;
		}
		
		public function getLastExitCode(): ?int { return $this->lastExitCode; }
		public function getLastStdout(): string { return $this->lastStdout; }
		public function getLastStderr(): string { return $this->lastStderr; }
		
		public function dryRun(): string {
			return $this->getCommandString();
		}
		
		public function reset(): self {
			$this->inputs = [];
			$this->outputs = [];
			$this->globalOptions = [];
			$this->filters = [];
			$this->maps = [];
			$this->metadata = [];
			$this->lastExitCode = null;
			$this->lastStdout = '';
			$this->lastStderr = '';
			return $this;
		}
	}
?>