// ASI TUBE - UI Rendering and DOM Interactions Layer

const UI = {
  // Show Toast Notification
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || this.createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '⚡';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(50px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },

  createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  },

  // Render Video Results
  renderResult(data) {
    const resultSection = document.getElementById('resultSection');
    const thumbImg = document.getElementById('resultThumb');
    const titleEl = document.getElementById('resultTitle');
    const channelEl = document.getElementById('resultChannel');
    const viewsEl = document.getElementById('resultViews');
    const durationEl = document.getElementById('resultDuration');
    const durationBadge = document.getElementById('durationBadge');
    
    if (!resultSection) return;

    thumbImg.src = data.thumbnail || 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg';
    titleEl.textContent = data.title || 'Video Title';
    channelEl.textContent = data.author || 'Creator';
    viewsEl.textContent = data.viewsFormatted || 'Trending';
    durationEl.textContent = data.durationFormatted || 'HD Video';
    durationBadge.textContent = data.durationFormatted || 'HD';

    window.currentVideoData = data;

    // Render default format table (video)
    this.renderVideoFormats(data.formats?.video || [], data);

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // Render Video Format Rows
  renderVideoFormats(formats, data) {
    const tbody = document.getElementById('formatTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    formats.forEach(fmt => {
      const tr = document.createElement('tr');
      
      let badgeClass = 'quality-badge';
      if (fmt.quality === '2160' || fmt.quality === '1440') badgeClass += ' badge-4k';
      else if (fmt.quality === '1080' || fmt.quality === '720') badgeClass += ' badge-hd';

      const directParam = fmt.directUrl ? encodeURIComponent(fmt.directUrl) : '';

      tr.innerHTML = `
        <td>
          <span class="${badgeClass}">${fmt.resolution || fmt.quality + 'p'}</span>
        </td>
        <td><strong>${(fmt.format || 'mp4').toUpperCase()}</strong></td>
        <td><span style="color: var(--text-secondary)">${fmt.estimatedSize || '~ MB'}</span></td>
        <td style="text-align: right;">
          <button class="btn-download-format" onclick="App.triggerDownload('${data.url}', '${fmt.quality}', '${fmt.format}', false, '${encodeURIComponent(data.title)}', '${directParam}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  // Render Audio Format Rows
  renderAudioFormats(formats, data) {
    const tbody = document.getElementById('formatTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    formats.forEach(fmt => {
      const tr = document.createElement('tr');
      const directParam = fmt.directUrl ? encodeURIComponent(fmt.directUrl) : '';

      tr.innerHTML = `
        <td>
          <span class="quality-badge badge-audio">🎵 ${fmt.bitrate || fmt.quality}</span>
        </td>
        <td><strong>${(fmt.format || 'mp3').toUpperCase()}</strong></td>
        <td><span style="color: var(--text-secondary)">${fmt.estimatedSize || '~ MB'}</span></td>
        <td style="text-align: right;">
          <button class="btn-download-format" onclick="App.triggerDownload('${data.url}', '${fmt.quality}', '${fmt.format}', true, '${encodeURIComponent(data.title)}', '${directParam}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Download MP3
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  // Render Thumbnail Downloads
  renderThumbnailFormats(thumbnails, data) {
    const tbody = document.getElementById('formatTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    thumbnails.forEach(thumb => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span class="quality-badge badge-hd">🖼️ ${thumb.quality} (${thumb.resolution})</span>
        </td>
        <td><strong>JPG / WebP</strong></td>
        <td><span style="color: var(--text-secondary)">Full HD</span></td>
        <td style="text-align: right;">
          <a class="btn-download-format" href="${thumb.url}" target="_blank" download="${data.title || 'thumbnail'}.jpg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Save Cover
          </a>
        </td>
      `;
      tbody.appendChild(tr);
    });
  },

  // Render In-App Search Cards
  renderSearchResults(results) {
    const grid = document.getElementById('searchGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!results || results.length === 0) {
      grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 20px;">No video results found. Try another keyword!</p>`;
      return;
    }

    results.forEach(video => {
      const card = document.createElement('div');
      card.className = 'search-card';
      card.innerHTML = `
        <div class="card-thumb-wrap">
          <img class="card-thumb" src="${video.thumbnail}" alt="${video.title}" loading="lazy" />
          <span class="duration-badge">${video.durationFormatted}</span>
        </div>
        <div class="card-body">
          <h4 class="card-title" title="${video.title}">${video.title}</h4>
          <div class="card-meta">
            <span>${video.author}</span>
            <span>${video.viewsFormatted}</span>
          </div>
          <button class="btn-card-download" onclick="App.processUrl('${video.url}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Convert / Download
          </button>
        </div>
      `;
      grid.appendChild(card);
    });
  },

  // Conversion / Download Modal
  showDownloadModal(title, quality, format) {
    const modal = document.getElementById('downloadModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalStatus = document.getElementById('modalStatus');
    const progressBar = document.getElementById('modalProgress');
    const downloadActionArea = document.getElementById('modalActionArea');

    if (!modal) return;

    modalTitle.textContent = title || 'Processing Download';
    modalStatus.textContent = 'Extracting direct high-speed stream...';
    progressBar.style.width = '35%';
    downloadActionArea.innerHTML = '';
    modal.style.display = 'flex';

    let current = 35;
    const interval = setInterval(() => {
      if (current < 90) {
        current += Math.floor(Math.random() * 15) + 5;
        if (current > 90) current = 90;
        progressBar.style.width = current + '%';
        if (current > 60) modalStatus.textContent = 'Preparing direct file stream...';
      }
    }, 200);

    return {
      finish(downloadUrl, filename, directStreamUrl) {
        clearInterval(interval);
        progressBar.style.width = '100%';
        modalStatus.textContent = '⚡ Stream connected! File download in progress...';
        
        let actionButtons = `
          <a class="btn-convert" style="width: 100%; justify-content: center; text-decoration: none; margin-top: 16px; font-size: 1.05rem;" href="${downloadUrl}" download="${filename || 'video.mp4'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Save File to Device (${filename})
          </a>
        `;

        if (directStreamUrl) {
          actionButtons += `
            <a class="btn-paste" style="width: 100%; justify-content: center; text-decoration: none; margin-top: 8px; text-align: center;" href="${directStreamUrl}" download="${filename}">
              ⚡ Fast Direct Stream Mirror
            </a>
          `;
        }

        downloadActionArea.innerHTML = actionButtons;

        // Auto trigger direct browser download via hidden iframe or anchor
        try {
          const downloadFrame = document.getElementById('hiddenDownloadFrame') || (() => {
            const iframe = document.createElement('iframe');
            iframe.id = 'hiddenDownloadFrame';
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            return iframe;
          })();
          downloadFrame.src = downloadUrl;
        } catch (e) {
          try {
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename || 'video.mp4';
            document.body.appendChild(a);
            a.click();
            a.remove();
          } catch (e2) {}
        }
      },
      error(msg) {
        clearInterval(interval);
        progressBar.style.width = '100%';
        progressBar.style.background = 'var(--accent-red)';
        modalStatus.textContent = msg || 'Could not complete stream generation';
      }
    };
  },

  closeModal() {
    const modal = document.getElementById('downloadModal');
    const previewModal = document.getElementById('previewModal');
    if (modal) modal.style.display = 'none';
    if (previewModal) previewModal.style.display = 'none';
  }
};
