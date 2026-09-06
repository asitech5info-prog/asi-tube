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
    }, 3500);
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
    const platformEl = document.getElementById('resultPlatform');
    const descContainer = document.getElementById('videoDescContainer');
    const descText = document.getElementById('resultDescription');
    const toggleDescBtn = document.getElementById('toggleDescBtn');
    
    if (!resultSection) return;

    thumbImg.src = data.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
    titleEl.textContent = data.title || 'Video Title';
    channelEl.textContent = data.author || 'Creator';
    viewsEl.textContent = data.viewsFormatted || 'Trending';
    durationEl.textContent = data.durationFormatted || 'HD Video';
    durationBadge.textContent = data.durationFormatted || 'HD';

    // Platform Badge
    if (platformEl) {
      const platform = (data.platform || 'youtube').toLowerCase();
      platformEl.className = `platform-badge badge-${platform}`;
      if (platform === 'tiktok') {
        platformEl.textContent = 'TikTok (No WM)';
      } else if (platform === 'instagram') {
        platformEl.textContent = 'Instagram Reel';
      } else if (platform === 'facebook') {
        platformEl.textContent = 'Facebook HD';
      } else if (platform === 'youtube') {
        platformEl.textContent = 'YouTube';
      } else {
        platformEl.textContent = 'Universal';
      }
    }

    // Description Section
    if (descContainer && descText) {
      const desc = (data.description || '').trim();
      if (desc) {
        descText.textContent = desc;
        descContainer.classList.remove('hidden');
        
        // Collapse long descriptions
        if (desc.length > 160 || desc.includes('\n')) {
          descText.classList.add('collapsed');
          if (toggleDescBtn) {
            toggleDescBtn.style.display = 'inline-block';
            toggleDescBtn.textContent = 'Show more';
          }
        } else {
          descText.classList.remove('collapsed');
          if (toggleDescBtn) toggleDescBtn.style.display = 'none';
        }
      } else {
        descContainer.classList.add('hidden');
      }
    }

    window.currentVideoData = data;

    // Render default format table (video)
    this.renderVideoFormats(data.formats?.video || [], data);

    resultSection.classList.remove('hidden');
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  // Render Video Format Rows
  renderVideoFormats(formats, data) {
    const tbody = document.getElementById('formatTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!formats || formats.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No video formats available for this link.</td></tr>`;
      return;
    }

    formats.forEach(fmt => {
      const tr = document.createElement('tr');
      
      let badgeClass = 'quality-badge';
      if (fmt.quality === '2160' || fmt.quality === '1440') badgeClass += ' badge-4k';
      else if (fmt.quality === '1080' || fmt.quality === '720') badgeClass += ' badge-hd';

      const directParam = fmt.directUrl ? encodeURIComponent(fmt.directUrl) : '';
      const isTikTok = (data.platform === 'tiktok');
      const actionLabel = isTikTok ? 'Download No-WM' : 'Download';

      tr.innerHTML = `
        <td>
          <span class="${badgeClass}">${fmt.resolution || fmt.quality + 'p'}</span>
        </td>
        <td><strong>${(fmt.format || 'mp4').toUpperCase()}</strong></td>
        <td><span style="color: var(--text-secondary)">${fmt.estimatedSize || '~ MB'}</span></td>
        <td style="text-align: right;">
          <button class="btn-download-format" onclick="App.triggerDownload('${encodeURIComponent(data.url)}', '${fmt.quality}', '${fmt.format}', false, '${encodeURIComponent(data.title)}', '${directParam}')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            ${actionLabel}
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

    if (!formats || formats.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No audio formats available.</td></tr>`;
      return;
    }

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
          <button class="btn-download-format" onclick="App.triggerDownload('${encodeURIComponent(data.url)}', '${fmt.quality}', '${fmt.format}', true, '${encodeURIComponent(data.title)}', '${directParam}')">
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

    if (!thumbnails || thumbnails.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Cover art unavailable for this video.</td></tr>`;
      return;
    }

    thumbnails.forEach(thumb => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <span class="quality-badge badge-hd">🖼️ ${thumb.quality} (${thumb.resolution})</span>
        </td>
        <td><strong>JPG / WebP</strong></td>
        <td><span style="color: var(--text-secondary)">Original Quality</span></td>
        <td style="text-align: right;">
          <a class="btn-download-format" href="${thumb.url}" target="_blank" download="${(data.title || 'thumbnail').replace(/[^a-zA-Z0-9_-]/g, '_')}.jpg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Save Cover
          </a>
        </td>
      `;
      tbody.appendChild(tr);
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
    modalStatus.textContent = 'Preparing high-speed seekable media stream (H.264 + AAC)...';
    progressBar.style.width = '35%';
    downloadActionArea.innerHTML = '';
    modal.style.display = 'flex';

    let current = 35;
    const interval = setInterval(() => {
      if (current < 90) {
        current += Math.floor(Math.random() * 15) + 5;
        if (current > 90) current = 90;
        progressBar.style.width = current + '%';
        if (current > 60) modalStatus.textContent = 'Applying faststart seeking optimization & AAC audio...';
      }
    }, 250);

    return {
      finish(downloadUrl, filename) {
        clearInterval(interval);
        progressBar.style.width = '100%';
        modalStatus.textContent = '⚡ File ready! Direct download in progress...';
        
        let actionButtons = `
          <a class="btn-convert" style="width: 100%; justify-content: center; text-decoration: none; margin-top: 16px; font-size: 1.05rem; padding: 14px 20px; border-radius: 10px;" href="${downloadUrl}" download="${filename || 'video.mp4'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Save File to Device
          </a>
          <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-muted); text-align: center; word-break: break-all;">
            📁 <strong>${filename}</strong>
          </div>
          <div style="margin-top: 8px; font-size: 0.82rem; color: var(--text-secondary); text-align: center;">
            ✓ Universal Compatibility (H.264 + AAC, Faststart Seekable)
          </div>
        `;

        downloadActionArea.innerHTML = actionButtons;

        // Auto trigger direct browser download
        try {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.setAttribute('download', filename || 'video.mp4');
          document.body.appendChild(a);
          a.click();
          setTimeout(() => a.remove(), 1000);
        } catch (e) {}
      },
      error(msg) {
        clearInterval(interval);
        progressBar.style.width = '100%';
        progressBar.style.background = 'var(--error, #ef4444)';
        modalStatus.textContent = msg || 'Could not complete video generation';
      }
    };
  },

  closeModal() {
    const modal = document.getElementById('downloadModal');
    if (modal) modal.style.display = 'none';
  }
};
