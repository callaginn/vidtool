<?php
	require_once 'bin/Helpers.php';
	require_once 'bin/ShellUtility.php';
	require_once 'bin/FfmpegWrapper.php';
	
	$shellUtil = new ShellUtility();
	
	$ff = new FfmpegWrapper($shellUtil);
	
	$ff->overwrite()
		->addInput('input.m4v')
		->addGlobalOption('-threads', '0')
		->addGlobalOption('-progress', 'pipe:2')
		->setFilterGraph('[0:v]scale=1280:-2[vscaled]; [vscaled]split=3[vthumb][vwebm][vmp4]; [vthumb]fps=1[vthumb_out]')
		->addMap("[vthumb_out]")
		->addOutput('uploads/output.jpg', [
			'-vframes' => 1,
			'-q:v' => 1,
			'-update' => 1
		])
		->addMap("[vwebm]")
		->addOutput('uploads/output.webm', [
			'-c:v' => 'libvpx',
			'-crf' => 4,
			'-b:v' => '1M',
			'-an' => null
		])
		->addMap("[vmp4]")
		->addOutput('uploads/output.mp4', [
			'-c:v' => 'libx264',
			'-pix_fmt' => 'yuv420p',
			'-profile:v' => 'baseline',
			'-level' => '4.0',
			'-crf' => 22,
			'-preset' => 'fast',
			'-movflags' => '+faststart',
			'-an' => null
		]);
		
		echo $ff->dryRun(), PHP_EOL;
?>