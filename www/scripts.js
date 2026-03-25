document.addEventListener('DOMContentLoaded', function() {
	if (window.Prism && Prism.highlightAll) {
		Prism.highlightAll();
	}
});

const form = document.getElementById('videoForm');
const mainCard = document.getElementById('mainCard');
const logDiv = document.querySelector('#log code');
const logPre = document.getElementById('log');
const progressWrapper = document.getElementById('progressWrapper');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const downloadLinks = document.getElementById('downloadLinks');
const submitBtn = document.getElementById('submitBtn');
const logsToggle = document.getElementById('logsToggle');
const logsToggleText = document.getElementById('logsToggleText');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('file');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const clearFile = document.getElementById('clearFile');

// Summary panel elements
const sumInput = document.getElementById('sumInput');
const sumTitle = document.getElementById('sumTitle');
const sumArtist = document.getElementById('sumArtist');
const sumChips = document.getElementById('sumChips');
const sumOutputs = document.getElementById('sumOutputs');
const sumOutputList = document.getElementById('sumOutputList');
const sumEncoding = document.getElementById('sumEncoding');
const sumSpeed = document.getElementById('sumSpeed');
const sumPosition = document.getElementById('sumPosition');
const sumResults = document.getElementById('sumResults');
const sumBarChart = document.getElementById('sumBarChart');
const sumComplete = document.getElementById('sumComplete');
const sumTotalTime = document.getElementById('sumTotalTime');
const viewToggle = document.getElementById('viewToggle');

// Summary state
let summary = {};
let currentView = 'summary';
function resetSummary() {
	summary = { title: '', artist: '', duration: '', durationSec: 0, resolution: '', codec: '', fps: '', outputs: [], outputSizes: [], totalTime: '' };
	sumInput.classList.add('d-none');
	sumOutputs.classList.add('d-none');
	sumEncoding.classList.add('d-none');
	sumResults.classList.add('d-none');
	sumComplete.classList.add('d-none');
	sumTitle.innerHTML = '';
	sumArtist.textContent = '';
	sumChips.innerHTML = '';
	sumOutputList.innerHTML = '';
	sumBarChart.innerHTML = '';
	sumTotalTime.textContent = '';
	sumSpeed.textContent = '--';
	sumSpeed.className = 'sum-speed-value';
	sumPosition.textContent = '--';
	// Reset to summary view
	currentView = 'summary';
	document.getElementById('tabSummary').classList.remove('d-none');
	document.getElementById('tabTerminal').classList.add('d-none');
	viewToggle.querySelector('i').className = 'bi bi-terminal';
	viewToggle.title = 'Show terminal';
}

function badgeClass(fmt) {
	const f = fmt.toLowerCase();
	if (f.includes('jpg') || f.includes('jpeg') || f.includes('image')) return 'sum-badge-jpg';
	if (f.includes('webm')) return 'sum-badge-webm';
	if (f.includes('mp4')) return 'sum-badge-mp4';
	return 'sum-badge-default';
}

function parseFfmpegLine(line) {
	// Title
	let m = line.match(/^\s*title\s*:\s*(.+)/);
	if (m) { summary.title = m[1].trim(); updateSummaryInput(); return; }

	// Artist
	m = line.match(/^\s*artist\s*:\s*(.+)/);
	if (m) { summary.artist = m[1].trim(); updateSummaryInput(); return; }

	// Duration
	m = line.match(/Duration:\s*([\d:.]+)/);
	if (m) { summary.duration = m[1]; updateSummaryInput(); return; }

	// Video stream (input) - pick the main video stream, not attached pic
	m = line.match(/Stream #0:\d+.*Video:\s*(\w+).*?,\s*\w+.*?,\s*(\d+)x(\d+).*?,\s*([\d.]+)\s*fps/);
	if (m) { summary.codec = m[1]; summary.resolution = `${m[2]}x${m[3]}`; summary.fps = m[4]; updateSummaryInput(); return; }

	// Output file
	m = line.match(/Output #\d+,\s*(\w+),\s*to\s+'.*?\/([\w.]+)'/);
	if (m) {
		const rawFmt = m[1].toUpperCase();
		const name = m[2];
		const ext = name.split('.').pop().toUpperCase();
		const fmt = ext || rawFmt;
		if (!summary.outputs.find(o => o.name === name)) {
			summary.outputs.push({ fmt, rawFmt, name });
			updateSummaryOutputs();
		}
		return;
	}

	// Output file sizes
	m = line.match(/\[out#\d+\/(\w+)\s.*?video:\s*(\d+)KiB/);
	if (m) {
		const fmt = m[1].toUpperCase();
		const sizeKB = parseInt(m[2], 10);
		const sizeStr = sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`;
		summary.outputSizes.push({ fmt, size: sizeStr });
		return;
	}

	// Speed from progress lines (e.g. "speed=0.87x")
	m = line.match(/^speed=([\d.]+)x/);
	if (m) { updateSummaryEncoding(m[1] + 'x', null); return; }

	// out_time from progress lines (e.g. "out_time=00:00:12.545867")
	m = line.match(/^out_time=([\d:.]+)/);
	if (m && m[1] !== 'N/A') {
		const durStr = summary.duration || '';
		const pos = m[1].replace(/\.\d+$/, '');
		updateSummaryEncoding(null, durStr ? `${pos} / ${durStr}` : pos);
		return;
	}

	// Total processing time
	m = line.match(/Total processing time:\s*([\d.]+)s/);
	if (m) { summary.totalTime = m[1]; return; }
}

function parseDurationToSec(dur) {
	const parts = dur.split(':');
	if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
	return 0;
}

function updateSummaryInput() {
	if (!summary.title && !summary.resolution && !summary.duration) return;
	sumInput.classList.remove('d-none');

	if (summary.title) {
		sumTitle.innerHTML = `<span class="sum-quote">\u201C</span>${summary.title}<span class="sum-quote">\u201D</span>`;
	} else {
		sumTitle.textContent = 'Untitled';
	}
	sumArtist.textContent = summary.artist ? `by ${summary.artist}` : '';

	sumChips.innerHTML = '';
	const chips = [];
	if (summary.resolution) chips.push(summary.resolution);
	if (summary.codec) chips.push(summary.codec.toUpperCase());
	if (summary.fps) chips.push(summary.fps + ' fps');
	if (summary.duration) chips.push(summary.duration);
	chips.forEach(text => {
		const chip = document.createElement('span');
		chip.className = 'sum-chip';
		chip.textContent = text;
		sumChips.appendChild(chip);
	});

	if (summary.duration) {
		summary.durationSec = parseDurationToSec(summary.duration);
	}
}

function updateSummaryOutputs() {
	if (summary.outputs.length === 0) return;
	sumOutputs.classList.remove('d-none');
	sumOutputList.innerHTML = '';
	summary.outputs.forEach(o => {
		const badge = document.createElement('span');
		badge.className = `sum-badge ${badgeClass(o.fmt)}`;
		badge.textContent = o.fmt;
		badge.title = o.name;
		sumOutputList.appendChild(badge);
	});
}

function updateSummaryEncoding(speed, position) {
	sumEncoding.classList.remove('d-none');
	if (speed) {
		sumSpeed.textContent = speed;
		const val = parseFloat(speed);
		sumSpeed.className = 'sum-speed-value' + (val >= 1.0 ? ' speed-fast' : val >= 0.5 ? ' speed-mid' : ' speed-slow');
	}
	if (position) {
		sumPosition.textContent = position;
	}
}

function barFillClass(fmt) {
	const f = fmt.toLowerCase();
	if (f.includes('jpg') || f.includes('jpeg') || f.includes('image')) return 'sum-bar-fill-jpg';
	if (f.includes('webm')) return 'sum-bar-fill-webm';
	if (f.includes('mp4')) return 'sum-bar-fill-mp4';
	return 'sum-bar-fill-default';
}

function showSummaryResults() {
	if (summary.outputSizes.length === 0 && !summary.totalTime) return;

	if (summary.outputSizes.length > 0) {
		sumResults.classList.remove('d-none');
		sumBarChart.innerHTML = '';
		const maxKB = Math.max(...summary.outputSizes.map(o => {
			const s = o.size;
			return s.includes('MB') ? parseFloat(s) * 1024 : parseFloat(s);
		}));
		summary.outputSizes.forEach(o => {
			const matchingOutput = summary.outputs.find(out => out.rawFmt === o.fmt || out.fmt === o.fmt);
			const name = matchingOutput ? matchingOutput.name : o.fmt;
			const fmt = matchingOutput ? matchingOutput.fmt : o.fmt;
			const sizeKB = o.size.includes('MB') ? parseFloat(o.size) * 1024 : parseFloat(o.size);
			const pct = maxKB > 0 ? (sizeKB / maxKB) * 100 : 0;
			const row = document.createElement('div');
			row.className = 'sum-bar-row';
			row.innerHTML = `<span class="sum-bar-name">${name}</span><div class="sum-bar-track"><div class="sum-bar-fill ${barFillClass(fmt)}" style="width: ${pct}%"></div></div><span class="sum-bar-size">${o.size}</span>`;
			sumBarChart.appendChild(row);
		});
	}

	if (summary.totalTime) {
		sumComplete.classList.remove('d-none');
		sumTotalTime.textContent = `Completed in ${summary.totalTime}s`;
	}
}

// View toggle (summary <-> terminal)
viewToggle.addEventListener('click', () => {
	if (currentView === 'summary') {
		currentView = 'terminal';
		document.getElementById('tabSummary').classList.add('d-none');
		document.getElementById('tabTerminal').classList.remove('d-none');
		viewToggle.querySelector('i').className = 'bi bi-speedometer2';
		viewToggle.title = 'Show summary';
	} else {
		currentView = 'summary';
		document.getElementById('tabSummary').classList.remove('d-none');
		document.getElementById('tabTerminal').classList.add('d-none');
		viewToggle.querySelector('i').className = 'bi bi-terminal';
		viewToggle.title = 'Show terminal';
	}
});

function show(el) { el.classList.remove('d-none'); }
function hide(el) { el.classList.add('d-none'); }

// Logs toggle
logsToggle.addEventListener('click', () => {
	mainCard.classList.toggle('logs-open');
	logsToggleText.textContent = mainCard.classList.contains('logs-open') ? 'Hide logs' : 'Show logs';
});

// Drop zone click opens file picker
dropZone.addEventListener('click', () => fileInput.click());

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
	e.preventDefault();
	dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
	dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
	e.preventDefault();
	dropZone.classList.remove('drag-over');
	const file = e.dataTransfer.files[0];
	if (file && file.type.startsWith('video/')) {
		setFile(file);
	}
});

// File input change
fileInput.addEventListener('change', () => {
	if (fileInput.files.length > 0) {
		setFile(fileInput.files[0]);
	}
});

// Clear file
clearFile.addEventListener('click', () => {
	fileInput.value = '';
	show(dropZone);
	hide(fileInfo);
	hide(submitBtn);
});

function setFile(file) {
	if (fileInput.files.length === 0 || fileInput.files[0] !== file) {
		const dt = new DataTransfer();
		dt.items.add(file);
		fileInput.files = dt.files;
	}
	fileName.textContent = file.name;
	fileSize.textContent = `(${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
	hide(dropZone);
	show(fileInfo);
	show(submitBtn);
}

function resetToUploadState() {
	downloadLinks.innerHTML = '';
	hide(progressWrapper);
	resetSummary();
	progressBar.style.width = '0%';
	progressText.textContent = '0%';
	fileInput.value = '';
	show(dropZone);
	hide(fileInfo);
	hide(submitBtn);
	submitBtn.disabled = false;
	clearFile.classList.remove('d-none');
}

let highlightPending = false;
function schedulePrismHighlight() {
	if (!window.Prism || !Prism.highlightElement) return;
	if (highlightPending) return;
	highlightPending = true;
	requestAnimationFrame(() => {
		try {
			Prism.highlightElement(logDiv);
		} finally {
			if (logPre) logPre.scrollTop = logPre.scrollHeight;
			highlightPending = false;
		}
	});
}

form.addEventListener('submit', async (e) => {
	e.preventDefault();

	logDiv.textContent = '';
	downloadLinks.innerHTML = '';
	show(progressWrapper);
	progressBar.style.width = '0%';
	progressText.textContent = '0%';
	progressBar.classList.add('progress-bar-animated');
	submitBtn.disabled = true;
	logsToggle.style.display = 'block';
	logsToggleText.textContent = 'Hide logs';
	mainCard.classList.add('logs-open');
	resetSummary();
	schedulePrismHighlight();

	const formData = new FormData(form);

	let response;
	try {
		response = await fetch(form.action, { method: 'POST', body: formData });
	} catch (err) {
		logDiv.textContent += `Network error: ${err}\n`;
		submitBtn.disabled = false;
		return;
	}

	if (!response.ok) {
		logDiv.textContent += `HTTP error: ${response.status} ${response.statusText}\n`;
		submitBtn.disabled = false;
		return;
	}

	if (!response.body) {
		logDiv.textContent = 'Streaming not supported in this browser.';
		submitBtn.disabled = false;
		return;
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder('utf-8');
	let buffer = '';
	let totalDuration = 0;

	const processLine = (line) => {
		if (!line) return;
		if (line.charCodeAt(0) === 0x1E) line = line.slice(1);

		try {
			const data = JSON.parse(line);
			switch (data.type) {
				case 'log': {
					logDiv.textContent += data.line + '\n';
					parseFfmpegLine(data.line);
					schedulePrismHighlight();
					break;
				}
				case 'duration': {
					totalDuration = Number(data.value) || 0;
					break;
				}
				case 'progress': {
					let percent = null;
					if (typeof data.percent === 'number' && !Number.isNaN(data.percent)) {
						percent = Math.round(Math.max(0, Math.min(100, data.percent)));
					} else if (totalDuration > 0 && typeof data.time !== 'undefined') {
						percent = Math.min(100, Math.round((Number(data.time) / totalDuration) * 100));
					}
					if (percent !== null) {
						progressBar.style.width = percent + '%';
						progressText.textContent = percent + '%';
					}
					break;
				}
				case 'done': {
					logDiv.textContent += 'Processing complete.\n';
					hide(submitBtn);
					clearFile.classList.add('d-none');
					showSummaryResults();

					if (data.links) {
						const dropdown = document.createElement('div');
						dropdown.className = 'dropdown';

						const btn = document.createElement('button');
						btn.className = 'btn btn-primary btn-lg w-100 py-3 dropdown-toggle';
						btn.type = 'button';
						btn.setAttribute('data-bs-toggle', 'dropdown');
						btn.setAttribute('aria-expanded', 'false');
						btn.innerHTML = '<i class="bi bi-download me-2"></i>Download';
						dropdown.appendChild(btn);

						const menu = document.createElement('ul');
						menu.className = 'dropdown-menu w-100';

						const fileLinks = [];
						data.links.forEach(linkObj => {
							const li = document.createElement('li');
							const a = document.createElement('a');
							a.className = 'dropdown-item';
							a.href = linkObj.url;
							a.download = linkObj.name;
							a.textContent = linkObj.name;
							li.appendChild(a);
							menu.appendChild(li);
							fileLinks.push(a);
						});

						const divider = document.createElement('li');
						divider.innerHTML = '<hr class="dropdown-divider">';
						menu.appendChild(divider);

						const allLi = document.createElement('li');
						const allLink = document.createElement('a');
						allLink.className = 'dropdown-item';
						allLink.href = '#';
						allLink.innerHTML = '<i class="bi bi-collection me-2"></i>All';
						allLink.addEventListener('click', (e) => {
							e.preventDefault();
							fileLinks.forEach((link, i) => setTimeout(() => link.click(), i * 200));
						});
						allLi.appendChild(allLink);
						menu.appendChild(allLi);

						dropdown.appendChild(menu);
						downloadLinks.appendChild(dropdown);

						const newUploadLink = document.createElement('a');
						newUploadLink.href = '#';
						newUploadLink.className = 'small text-muted d-block text-center mt-3';
						newUploadLink.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Upload another video';
						newUploadLink.addEventListener('click', (e) => {
							e.preventDefault();
							resetToUploadState();
						});
						downloadLinks.appendChild(newUploadLink);
					}

					progressBar.style.width = '100%';
					progressText.textContent = '100%';
					progressBar.classList.remove('progress-bar-animated');
					break;
				}
				case 'error': {
					logDiv.textContent += 'Error: ' + data.message + '\n';
					progressBar.classList.remove('progress-bar-animated');
					submitBtn.disabled = false;
					break;
				}
				default: {
					logDiv.textContent += line + '\n';
				}
			}
		} catch (e) {
			logDiv.textContent += line + '\n';
		}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			if (buffer.trim()) processLine(buffer.trim());
			break;
		}
		buffer += decoder.decode(value, { stream: true });
		const parts = buffer.split(/\r?\n/);
		buffer = parts.pop();
		for (const part of parts) {
			const line = part.trim();
			if (line) processLine(line);
		}
	}
});
