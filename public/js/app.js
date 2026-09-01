// ASI TUBE - Main Application Controller

const App = {
  activeTab: 'video',
  activeFormatTab: 'video',

  init() {
    this.bindEvents();
    this.initTheme();
    this.loadTrendingVideos();
  },

  bindEvents() {
    const searchForm = document.getElementById('searchForm');
    const urlInput = document.getElementById('urlInput');
    const btnPaste = document.getElementById('btnPaste');
    const btnClear = document.getElementById('btnClear');
    const themeToggle = document.getElementById('themeToggle');

    if (searchForm) {
      searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const val = urlInput.value.trim();
        if (val) {
          if (val.startsWith('http://') || val.startsWith('https://')) {
            this.processUrl(val);
          } else {
            this.executeSearch(val);
          }
        } else {
          UI.showToast('Please enter a video URL or search query', 'warning');
        }
      });
    }

    if (urlInput) {
      urlInput.addEventListener('input', () => {
        if (btnClear) {
          btnClear.style.display = urlInput.value ? 'block' : 'none';
        }
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        urlInput.value = '';
        btnClear.style.display = 'none';
        urlInput.focus();
      });
    }

    if (btnPaste) {
      btnPaste.addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            urlInput.value = text.trim();
            btnClear.style.display = 'block';
            UI.showToast('Link pasted from clipboard!', 'success');
            this.processUrl(text.trim());
          }
        } catch (err) {
          UI.showToast('Please paste link using Ctrl+V', 'info');
        }
      });
    }

    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('asi_tube_theme', newTheme);
        UI.showToast(`Switched to ${newTheme} mode`, 'info');
      });
    }

    document.querySelectorAll('.cat-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeTab = tab.dataset.tab;
        
        if (this.activeTab === 'mp3') {
          UI.showToast('Selected MP3 Audio Downloader Mode', 'info');
        } else if (this.activeTab === 'shorts') {
          UI.showToast('Selected YouTube Shorts Downloader Mode', 'info');
        } else if (this.activeTab === 'tiktok') {
          UI.showToast('Selected TikTok & Reels Downloader Mode', 'info');
        }
      });
    });

    document.querySelectorAll('.fmt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.fmt-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.activeFormatTab = tab.dataset.fmt;
        
        if (window.currentVideoData) {
          if (this.activeFormatTab === 'video') {
            UI.renderVideoFormats(window.currentVideoData.formats?.video || [], window.currentVideoData);
          } else if (this.activeFormatTab === 'audio') {
            UI.renderAudioFormats(window.currentVideoData.formats?.audio || [], window.currentVideoData);
          } else if (this.activeFormatTab === 'thumbnails') {
            UI.renderThumbnailFormats(window.currentVideoData.formats?.thumbnails || [], window.currentVideoData);
          }
        }
      });
    });

    const btnPreview = document.getElementById('btnPlayPreview');
    if (btnPreview) {
      btnPreview.addEventListener('click', () => {
        if (window.currentVideoData?.id) {
          this.openPreviewPlayer(window.currentVideoData.id);
        }
      });
    }

    const inAppSearchForm = document.getElementById('inAppSearchForm');
    const inAppSearchInput = document.getElementById('inAppSearchInput');
    if (inAppSearchForm) {
      inAppSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = inAppSearchInput.value.trim();
        if (q) this.executeSearch(q);
      });
    }

    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        item.classList.toggle('active');
      });
    });
  },

  initTheme() {
    const savedTheme = localStorage.getItem('asi_tube_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  },

  async processUrl(url) {
    const loadingBox = document.getElementById('loadingBox');
    const btnConvert = document.getElementById('btnConvert');
    const resultSection = document.getElementById('resultSection');

    if (loadingBox) loadingBox.style.display = 'flex';
    if (btnConvert) btnConvert.disabled = true;
    if (resultSection) resultSection.style.display = 'none';

    try {
      const data = await API.getInfo(url);
      if (data && data.title) {
        UI.renderResult(data);
        UI.showToast(`Found: ${data.title.substring(0, 40)}...`, 'success');
      } else {
        throw new Error('No metadata returned');
      }
    } catch (err) {
      UI.showToast('Extracting stream with fallback...', 'warning');
      const fallback = API.clientFallbackInfo(url);
      UI.renderResult(fallback);
    } finally {
      if (loadingBox) loadingBox.style.display = 'none';
      if (btnConvert) btnConvert.disabled = false;
    }
  },

  async triggerDownload(url, quality, format, audioOnly, rawTitle, encodedDirectUrl) {
    const title = decodeURIComponent(rawTitle || 'video');
    const directUrl = encodedDirectUrl ? decodeURIComponent(encodedDirectUrl) : null;
    const modalHandler = UI.showDownloadModal(title, quality, format);

    try {
      const result = await API.getDownload(url, quality, format, audioOnly, title, directUrl);
      if (result && result.downloadUrl) {
        modalHandler.finish(result.downloadUrl, result.filename);
        UI.showToast('Download started!', 'success');
      } else {
        throw new Error('Could not generate download link');
      }
    } catch (err) {
      modalHandler.error('Failed to generate direct download link');
      UI.showToast('Please try clicking another format or resolution', 'error');
    }
  },

  async executeSearch(query) {
    const searchSection = document.getElementById('searchSection');
    const searchGrid = document.getElementById('searchGrid');
    
    if (searchGrid) {
      searchGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
          <div class="spinner" style="margin: 0 auto 16px;"></div>
          <p style="color: var(--text-secondary)">Searching YouTube videos for "${query}"...</p>
        </div>
      `;
    }

    if (searchSection) {
      searchSection.scrollIntoView({ behavior: 'smooth' });
    }

    const results = await API.search(query);
    UI.renderSearchResults(results);
  },

  async loadTrendingVideos() {
    const results = await API.search('trending popular music 4k');
    UI.renderSearchResults(results);
  },

  openPreviewPlayer(videoId) {
    const modal = document.getElementById('previewModal');
    const iframe = document.getElementById('previewIframe');
    if (modal && iframe) {
      iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
      modal.style.display = 'flex';
    }
  },

  closePreviewPlayer() {
    const modal = document.getElementById('previewModal');
    const iframe = document.getElementById('previewIframe');
    if (modal && iframe) {
      iframe.src = '';
      modal.style.display = 'none';
    }
  }
};

window.App = App;
window.UI = UI;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
