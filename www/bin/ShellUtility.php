<?php
	/*/
		Shell Utility
		This utility retrieves shell profile information and command paths,
		so that PHP scripts can find commands without hardcoding paths.
		Stephen Ginn at Crema Design Studio
		
		Usage:
		$shellUtility = new ShellUtility();

		// Get info about user shell
		$shellInfo = $shellUtility->getShellInfo();
		echo "User shell: " . $shellInfo->userShell . PHP_EOL;
		echo "Profile file: " . ($shellInfo->profile ?: 'None') . PHP_EOL;

		// Find full path to a command, e.g., ffmpeg
		$ffmpegPath = $shellUtility->findCommand('ffmpeg');
		echo "ffmpeg is located at: $ffmpegPath" . PHP_EOL;

		// You can reuse the same instance to find other commands without extra shell lookups
		$phpPath = $shellUtility->findCommand('php');
		echo "php is located at: $phpPath" . PHP_EOL;
	/*/
	
	class ShellUtility {
		private ?object $shellInfo = null;
		private array $cache = [];
		private string $profile = '';
		private string $userShell = '';
		
		public function __construct() {
			if (!function_exists('posix_getuid') || !function_exists('posix_getpwuid'))
				throw new RuntimeException('POSIX functions not available.');
			
			$shellProfiles = (object) [
				'zsh' => '.zshrc',
				'bash' => '.bashrc',
				'default' => '.profile'
			];
			
			$info = (object) posix_getpwuid(posix_getuid());
			$shell = basename($info->shell ?? 'default');
			$currentShellProfile = $shellProfiles->$shell;
			$profilePath = !empty($info->dir) ? "$info->dir/$currentShellProfile" : '';
			
			if (!is_file($profilePath)) $profilePath = '';
			
			$this->profile = $profilePath;
			$this->userShell = $info->shell ?? '';
			$this->shellInfo = (object) [
				'profile' => $this->profile,
				'userShell' => $this->userShell
			];
		}
		
		public function getShellInfo(): object {
			return $this->shellInfo;
		}
		
		public function findCommand(string $command): string {
			if (isset($this->cache[$command])) {
				return $this->cache[$command];
			}
			
			if (empty($this->shellInfo->userShell)) {
				throw new RuntimeException('User shell unknown.');
			}
			
			$shell = escapeshellcmd($this->shellInfo->userShell);
			$profileCmd = $this->shellInfo->profile ? 'source ' . escapeshellarg($this->shellInfo->profile) . ';' : '';
			$cmd = "{$shell} -c '{$profileCmd} which " . escapeshellarg($command) . "'";
			
			exec($cmd, $output, $ret);
			if ($ret !== 0 || empty($output)) {
				throw new RuntimeException("Command '{$command}' not found.");
			}
			
			foreach ($output as $line) {
				$line = trim($line);
				if ($line !== '') {
					return $this->cache[$command] = $line;
				}
			}
			
			throw new RuntimeException("Empty output for command '{$command}'.");
		}
	}

?>