class VidTool {
	static PARSE_RULES = [
		[/^\s*title\s*:\s*(.+)/, 'input',
			(s, m) => { s.title = m[1].trim(); }],
		[/^\s*artist\s*:\s*(.+)/, 'input',
			(s, m) => { s.artist = m[1].trim(); }],
		[/Duration:\s*([\d:.]+)/, 'input',
			(s, m) => { s.duration = m[1]; }],
		[/Stream #0:\d+.*Video:\s*(\w+).*?,\s*\w+.*?,\s*(\d+)x(\d+).*?,\s*([\d.]+)\s*fps/,
			'input', (s, m) => {
				s.codec = m[1];
				s.resolution = `${m[2]}x${m[3]}`;
				s.fps = m[4];
			}],
		[/Output #\d+,\s*(\w+),\s*to\s+'.*?\/([\w.]+)'/,
			'outputs', (s, m) => {
				const raw = m[1].toUpperCase();
				const name = m[2];
				const ext = name.split('.').pop().toUpperCase();
				const fmt = ext || raw;
				if (!s.outputs.find(o => o.name === name))
					s.outputs.push({ fmt, rawFmt: raw, name });
			}],
		[/\[out#\d+\/(\w+)\s.*?video:\s*(\d+)KiB/, null, (s, m) => {
			const fmt = m[1].toUpperCase();
			const kb = parseInt(m[2], 10);
			const size = kb >= 1024
				? `${(kb / 1024).toFixed(1)} MB`
				: `${kb} KB`;
			s.outputSizes.push({ fmt, size });
		}],
		[/^speed=([\d.]+)x/, 'encoding',
			(s, m) => { s.speed = m[1] + 'x'; }],
		[/^out_time=([\d:.]+)/, 'encoding', (s, m) => {
			if (m[1] === 'N/A') return;
			const pos = m[1].replace(/\.\d+$/, '');
			s.outTime = s.duration ? `${pos} / ${s.duration}` : pos;
		}],
		[/Total processing time:\s*([\d.]+)s/, null,
			(s, m) => { s.totalTime = m[1]; }],
	];
	
	constructor() {
		this.el = this.#buildEls();
		this.summary = {};
		this.view = 'summary';
		this.hlPending = false;
		this.duration = 0;
		this.#resetSummary();
		this.#bind();
		if (window.Prism && Prism.highlightAll) Prism.highlightAll();
	}
	
	#id(id) { return document.getElementById(id); }
	
	#buildEls() {
		return {
			form: this.#id('videoForm'),
			card: this.#id('mainCard'),
			logCode: document.querySelector('#log code'),
			logPre: this.#id('log'),
			progress: this.#id('progressWrapper'),
			bar: this.#id('progressBar'),
			barText: this.#id('progressText'),
			downloads: this.#id('downloadLinks'),
			submit: this.#id('submitBtn'),
			logsToggle: this.#id('logsToggle'),
			logsText: this.#id('logsToggleText'),
			dropZone: this.#id('dropZone'),
			fileInput: this.#id('file'),
			fileInfo: this.#id('fileInfo'),
			fileName: this.#id('fileName'),
			fileSize: this.#id('fileSize'),
			clearFile: this.#id('clearFile'),
			sumInput: this.#id('sumInput'),
			sumTitle: this.#id('sumTitle'),
			sumArtist: this.#id('sumArtist'),
			sumChips: this.#id('sumChips'),
			sumOutputs: this.#id('sumOutputs'),
			sumOutputList: this.#id('sumOutputList'),
			sumEncoding: this.#id('sumEncoding'),
			sumSpeed: this.#id('sumSpeed'),
			sumPosition: this.#id('sumPosition'),
			sumResults: this.#id('sumResults'),
			sumBarChart: this.#id('sumBarChart'),
			sumComplete: this.#id('sumComplete'),
			sumTotalTime: this.#id('sumTotalTime'),
			viewToggle: this.#id('viewToggle'),
			tabSummary: this.#id('tabSummary'),
			tabTerminal: this.#id('tabTerminal'),
		};
	}
	
	#show(el) { el.classList.remove('d-none'); }
	#hide(el) { el.classList.add('d-none'); }
	
	#hideAll(...els) {
		els.forEach(el => el.classList.add('d-none'));
	}
	
	#makeEl(tag, props = {}, attrs = {}) {
		const el = document.createElement(tag);
		Object.assign(el, props);
		for (const [k, v] of Object.entries(attrs))
			el.setAttribute(k, v);
		return el;
	}
	
	#fmtClass(prefix, fmt) {
		const f = fmt.toLowerCase();
		const type =
			f.includes('jpg') || f.includes('jpeg')
				|| f.includes('image') ? 'jpg'
			: f.includes('webm') ? 'webm'
			: f.includes('mp4') ? 'mp4'
			: 'default';
		return `${prefix}-${type}`;
	}
	
	// --- State ---
	
	#freshSummary() {
		return {
			title: '', artist: '', duration: '', durationSec: 0,
			resolution: '', codec: '', fps: '',
			outputs: [], outputSizes: [],
			speed: null, outTime: null, totalTime: '',
		};
	}
	
	#resetSummary() {
		this.summary = this.#freshSummary();
		const e = this.el;
		this.#hideAll(
			e.sumInput, e.sumOutputs, e.sumEncoding,
			e.sumResults, e.sumComplete
		);
		e.sumTitle.innerHTML = '';
		e.sumArtist.textContent = '';
		e.sumChips.innerHTML = '';
		e.sumOutputList.innerHTML = '';
		e.sumBarChart.innerHTML = '';
		e.sumTotalTime.textContent = '';
		e.sumSpeed.textContent = '--';
		e.sumSpeed.className = 'sum-speed-value';
		e.sumPosition.textContent = '--';
		this.#setView('summary');
	}
	
	#resetToUpload() {
		const e = this.el;
		e.downloads.innerHTML = '';
		this.#hide(e.progress);
		this.#resetSummary();
		e.bar.style.width = '0%';
		e.barText.textContent = '0%';
		e.fileInput.value = '';
		this.#show(e.dropZone);
		this.#hide(e.fileInfo);
		this.#hide(e.submit);
		e.submit.disabled = false;
		e.clearFile.classList.remove('d-none');
	}
	
	// --- View toggle ---
	
	#setView(view) {
		this.view = view;
		const sum = view === 'summary';
		this.el.tabSummary.classList.toggle('d-none', !sum);
		this.el.tabTerminal.classList.toggle('d-none', sum);
		const icon = this.el.viewToggle.querySelector('i');
		icon.className = sum ? 'bi bi-terminal' : 'bi bi-speedometer2';
		this.el.viewToggle.title = sum ? 'Show terminal' : 'Show summary';
	}
	
	// --- FFmpeg parsing ---
	
	#parseLine(line) {
		for (const [re, tag, fn] of VidTool.PARSE_RULES) {
			const m = line.match(re);
			if (m) {
				fn(this.summary, m);
				if (tag) this.#refreshUI(tag);
				return;
			}
		}
	}
	
	#refreshUI(tag) {
		if (tag === 'input') this.#updateInput();
		else if (tag === 'outputs') this.#updateOutputs();
		else if (tag === 'encoding') this.#updateEncoding();
	}
	
	#parseDuration(dur) {
		const p = dur.split(':');
		return p.length === 3
			? parseFloat(p[0]) * 3600 + parseFloat(p[1]) * 60 + parseFloat(p[2])
			: 0;
	}
	
	// --- Summary UI updates ---
	
	#updateInput() {
		const s = this.summary;
		if (!s.title && !s.resolution && !s.duration) return;
		this.#show(this.el.sumInput);
		
		if (s.title) {
			const q = 'sum-quote fw-light';
			this.el.sumTitle.innerHTML =
				`<span class="${q}">\u201C</span>${s.title}`
				+ `<span class="${q}">\u201D</span>`;
		} else {
			this.el.sumTitle.textContent = 'Untitled';
		}
		
		this.el.sumArtist.textContent = s.artist ? `by ${s.artist}` : '';
		
		this.el.sumChips.innerHTML = '';
		const chips = [];
		if (s.resolution) chips.push(s.resolution);
		if (s.codec) chips.push(s.codec.toUpperCase());
		if (s.fps) chips.push(s.fps + ' fps');
		if (s.duration) chips.push(s.duration);
		
		const cls = 'sum-chip d-inline-flex align-items-center fw-medium';
		for (const text of chips) {
			this.el.sumChips.appendChild(
				this.#makeEl('span', { className: cls, textContent: text })
			);
		}
		
		if (s.duration) s.durationSec = this.#parseDuration(s.duration);
	}
	
	#updateOutputs() {
		const s = this.summary;
		if (s.outputs.length === 0) return;
		this.#show(this.el.sumOutputs);
		this.el.sumOutputList.innerHTML = '';
		
		const base =
			'sum-badge d-inline-flex align-items-center fw-semibold text-uppercase';
		for (const o of s.outputs) {
			const cls = base + ' ' + this.#fmtClass('sum-badge', o.fmt);
			this.el.sumOutputList.appendChild(
				this.#makeEl('span', {
					className: cls, textContent: o.fmt, title: o.name,
				})
			);
		}
	}
	
	#updateEncoding() {
		const s = this.summary;
		this.#show(this.el.sumEncoding);
		if (s.speed) {
			this.el.sumSpeed.textContent = s.speed;
			const val = parseFloat(s.speed);
			const sc = val >= 1.0 ? ' speed-fast'
				: val >= 0.5 ? ' speed-mid' : ' speed-slow';
			this.el.sumSpeed.className = 'sum-speed-value' + sc;
		}
		if (s.outTime) this.el.sumPosition.textContent = s.outTime;
	}
	
	#showResults() {
		const s = this.summary;
		if (!s.outputSizes.length && !s.totalTime) return;
		
		if (s.outputSizes.length > 0) {
			this.#show(this.el.sumResults);
			this.el.sumBarChart.innerHTML = '';
			const toKB = (str) => str.includes('MB')
				? parseFloat(str) * 1024 : parseFloat(str);
			const maxKB = Math.max(
				...s.outputSizes.map(o => toKB(o.size))
			);
			for (const o of s.outputSizes) {
				const match = s.outputs.find(
					x => x.rawFmt === o.fmt || x.fmt === o.fmt
				);
				const name = match ? match.name : o.fmt;
				const fmt = match ? match.fmt : o.fmt;
				const pct = maxKB > 0 ? (toKB(o.size) / maxKB) * 100 : 0;
				const fill = this.#fmtClass('sum-bar-fill', fmt);
				const row = this.#makeEl('div', { className: 'sum-bar-row' });
				row.innerHTML =
					`<span class="sum-bar-name text-truncate">${name}</span>`
					+ '<div class="sum-bar-track">'
					+ `<div class="sum-bar-fill ${fill}"`
					+ ` style="width: ${pct}%"></div></div>`
					+ `<span class="sum-bar-size text-end fw-semibold">`
					+ `${o.size}</span>`;
				this.el.sumBarChart.appendChild(row);
			}
		}
		
		if (s.totalTime) {
			this.#show(this.el.sumComplete);
			this.el.sumTotalTime.textContent = `Completed in ${s.totalTime}s`;
		}
	}
	
	// --- Prism highlighting ---
	
	#highlight() {
		if (!window.Prism || !Prism.highlightElement) return;
		if (this.hlPending) return;
		this.hlPending = true;
		requestAnimationFrame(() => {
			try {
				Prism.highlightElement(this.el.logCode);
			} finally {
				const lp = this.el.logPre;
				if (lp) lp.scrollTop = lp.scrollHeight;
				this.hlPending = false;
			}
		});
	}
	
	// --- File handling ---
	
	#setFile(file) {
		const e = this.el;
		if (e.fileInput.files.length === 0 || e.fileInput.files[0] !== file) {
			const dt = new DataTransfer();
			dt.items.add(file);
			e.fileInput.files = dt.files;
		}
		e.fileName.textContent = file.name;
		const mb = (file.size / (1024 * 1024)).toFixed(1);
		e.fileSize.textContent = `(${mb} MB)`;
		this.#hide(e.dropZone);
		this.#show(e.fileInfo);
		this.#show(e.submit);
	}
	
	// --- Upload & streaming ---
	
	#prepareUI() {
		const e = this.el;
		e.logCode.textContent = '';
		e.downloads.innerHTML = '';
		this.#show(e.progress);
		e.bar.style.width = '0%';
		e.barText.textContent = '0%';
		e.bar.classList.add('progress-bar-animated');
		e.submit.disabled = true;
		e.logsToggle.style.display = 'block';
		e.logsText.textContent = 'Hide logs';
		e.card.classList.add('logs-open');
		this.#resetSummary();
		this.#highlight();
	}
	
	async #upload() {
		const data = new FormData(this.el.form);
		try {
			const res = await fetch(
				this.el.form.action, { method: 'POST', body: data }
			);
			if (!res.ok) {
				this.el.logCode.textContent +=
					`HTTP error: ${res.status} ${res.statusText}\n`;
				this.el.submit.disabled = false;
				return null;
			}
			if (!res.body) {
				this.el.logCode.textContent = 'Streaming not supported.\n';
				this.el.submit.disabled = false;
				return null;
			}
			return res;
		} catch (err) {
			this.el.logCode.textContent += `Network error: ${err}\n`;
			this.el.submit.disabled = false;
			return null;
		}
	}
	
	async #streamResponse(res) {
		const reader = res.body.getReader();
		const decoder = new TextDecoder('utf-8');
		let buffer = '';
		this.duration = 0;
		
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				if (buffer.trim()) this.#processLine(buffer.trim());
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			const parts = buffer.split(/\r?\n/);
			buffer = parts.pop();
			for (const part of parts) {
				const line = part.trim();
				if (line) this.#processLine(line);
			}
		}
	}
	
	#processLine(line) {
		if (line.charCodeAt(0) === 0x1E) line = line.slice(1);
		try {
			this.#processMessage(JSON.parse(line), line);
		} catch {
			this.el.logCode.textContent += line + '\n';
		}
	}
	
	#processMessage(data, raw) {
		const e = this.el;
		switch (data.type) {
			case 'log':
				e.logCode.textContent += data.line + '\n';
				this.#parseLine(data.line);
				this.#highlight();
				break;
			case 'duration':
				this.duration = Number(data.value) || 0;
				break;
			case 'progress':
				this.#updateProgress(data);
				break;
			case 'done':
				this.#handleDone(data);
				break;
			case 'error':
				e.logCode.textContent += 'Error: ' + data.message + '\n';
				e.bar.classList.remove('progress-bar-animated');
				e.submit.disabled = false;
				break;
			default:
				e.logCode.textContent += raw + '\n';
		}
	}
	
	#updateProgress(data) {
		let pct = null;
		if (typeof data.percent === 'number' && !Number.isNaN(data.percent)) {
			pct = Math.round(Math.max(0, Math.min(100, data.percent)));
		} else if (this.duration > 0 && data.time !== undefined) {
			pct = Math.min(100,
				Math.round((Number(data.time) / this.duration) * 100));
		}
		if (pct !== null) {
			this.el.bar.style.width = pct + '%';
			this.el.barText.textContent = pct + '%';
		}
	}
	
	#handleDone(data) {
		const e = this.el;
		e.logCode.textContent += 'Processing complete.\n';
		this.#hide(e.submit);
		e.clearFile.classList.add('d-none');
		this.#showResults();
		if (data.links) this.#buildDownloads(data.links);
		e.bar.style.width = '100%';
		e.barText.textContent = '100%';
		e.bar.classList.remove('progress-bar-animated');
	}
	
	#buildDownloads(links) {
		const e = this.el;
		const dropdown = this.#makeEl('div', { className: 'dropdown' });
		const btn = this.#makeEl('button', {
			className: 'btn btn-primary btn-lg w-100 py-3 dropdown-toggle',
			type: 'button',
			innerHTML: '<i class="bi bi-download me-2"></i>Download',
		}, {
			'data-bs-toggle': 'dropdown',
			'aria-expanded': 'false',
		});
		dropdown.appendChild(btn);
		
		const menu = this.#makeEl('ul', { className: 'dropdown-menu w-100' });
		const fileLinks = [];
		
		for (const link of links) {
			const li = this.#makeEl('li');
			const a = this.#makeEl('a', {
				className: 'dropdown-item',
				href: link.url, download: link.name, textContent: link.name,
			});
			li.appendChild(a);
			menu.appendChild(li);
			fileLinks.push(a);
		}
		
		const divider = this.#makeEl('li');
		divider.innerHTML = '<hr class="dropdown-divider">';
		menu.appendChild(divider);
		
		const allLi = this.#makeEl('li');
		const allLink = this.#makeEl('a', {
			className: 'dropdown-item',
			href: '#',
			innerHTML: '<i class="bi bi-collection me-2"></i>All',
		});
		allLink.addEventListener('click', (ev) => {
			ev.preventDefault();
			fileLinks.forEach((a, i) => setTimeout(() => a.click(), i * 200));
		});
		allLi.appendChild(allLink);
		menu.appendChild(allLi);
		dropdown.appendChild(menu);
		e.downloads.appendChild(dropdown);
		
		const again = this.#makeEl('a', {
			href: '#',
			className: 'small text-muted d-block text-center mt-3',
			innerHTML:
				'<i class="bi bi-arrow-repeat me-1"></i>Upload another video',
		});
		again.addEventListener('click', (ev) => {
			ev.preventDefault();
			this.#resetToUpload();
		});
		e.downloads.appendChild(again);
	}
	
	// --- Event binding ---
	
	#bind() {
		const e = this.el;
		
		e.form.addEventListener('submit', (ev) => this.#handleSubmit(ev));
		e.dropZone.addEventListener('click', () => e.fileInput.click());
		
		e.dropZone.addEventListener('dragover', (ev) => {
			ev.preventDefault();
			e.dropZone.classList.add('drag-over');
		});
		
		e.dropZone.addEventListener('dragleave',
			() => e.dropZone.classList.remove('drag-over'));
			
		e.dropZone.addEventListener('drop', (ev) => {
			ev.preventDefault();
			e.dropZone.classList.remove('drag-over');
			const f = ev.dataTransfer.files[0];
			if (f && f.type.startsWith('video/')) this.#setFile(f);
		});
		
		e.fileInput.addEventListener('change', () => {
			if (e.fileInput.files.length > 0)
				this.#setFile(e.fileInput.files[0]);
		});
		
		e.clearFile.addEventListener('click', () => {
			e.fileInput.value = '';
			this.#show(e.dropZone);
			this.#hide(e.fileInfo);
			this.#hide(e.submit);
		});
		
		e.viewToggle.addEventListener('click', () => {
			this.#setView(
				this.view === 'summary' ? 'terminal' : 'summary'
			);
		});
		
		e.logsToggle.addEventListener('click', () => {
			e.card.classList.toggle('logs-open');
			e.logsText.textContent =
				e.card.classList.contains('logs-open')
					? 'Hide logs' : 'Show logs';
		});
	}
	
	async #handleSubmit(ev) {
		ev.preventDefault();
		this.#prepareUI();
		const res = await this.#upload();
		if (res) await this.#streamResponse(res);
	}
}

new VidTool();
