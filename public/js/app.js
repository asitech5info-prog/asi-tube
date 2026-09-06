// ASI TUBE - Main Application Controller (Zero Ads / In-App Direct Stream Pipeline)

const App = {
  activeFormatTab: 'video',

  init() {
    this.bindDomElements();
    this.bindEvents();
    this.initTheme();
  },

  bindDomElements() {
    this.mediaUrl = document.getElementById('media-url');
    this.downloadBtn = document.getElementById('download-btn');
    this.clearBtn = document.getElementById('clear-btn');
    this.errorMessage = document.getElementById('error-message');
    this.resultContainer = document.getElementById('result-container');
    this.loadingContainer = document.getElementById('loading-container');
    this.resultSection = document.getElementById('resultSection');
    this.themeToggle = document.getElementById('theme-toggle');
  },

  initTheme() {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
      }
    } catch (e) {}
  },

  getCurrentTheme() {
    return document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
  },

  // Parse and validate YouTube URL
  parseYouTubeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') {
      return { valid: false, message: 'Please enter a video URL.' };
    }

    try {
      const trimmed = urlStr.trim();
      // Handle raw 11-char video ID directly
      if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return { valid: true, id: trimmed, cleanUrl: `https://www.youtube.com/watch?v=${trimmed}` };
      }

      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const host = parsed.hostname.toLowerCase();
      const pathSegments = parsed.pathname.split('/').filter(p => p !== '');

      if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
        return { valid: false, message: 'Please enter a supported YouTube URL.' };
      }

      if (pathSegments.some(s => s.toLowerCase() === 'live')) {
        return { valid: false, message: 'Live stream recordings are not supported.' };
      }

      let videoId = null;
      const listId = parsed.searchParams.get('list');
      const shortsIdx = pathSegments.findIndex(s => s.toLowerCase() === 'shorts');

      if (shortsIdx !== -1 && pathSegments[shortsIdx + 1]) {
        videoId = pathSegments[shortsIdx + 1].slice(0, 11);
      } else if (host.includes('youtu.be')) {
        videoId = pathSegments[0] ? pathSegments[0].slice(0, 11) : null;
      } else if (parsed.searchParams.get('v')) {
        videoId = parsed.searchParams.get('v').slice(0, 11);
      } else {
        const embedIdx = pathSegments.findIndex(s => ['v', 'embed', 'e'].includes(s.toLowerCase()));
        if (embedIdx !== -1 && pathSegments[embedIdx + 1]) {
          videoId = pathSegments[embedIdx + 1].slice(0, 11);
        }
      }

      if (videoId) {
        return {
          valid: true,
          id: videoId,
          cleanUrl: `https://www.youtube.com/watch?v=${videoId}`
        };
      }

      return { valid: false, message: 'Please enter a valid YouTube video URL.' };
    } catch (err) {
      return { valid: false, message: 'Please enter a valid URL (e.g. https://www.youtube.com/watch?v=...).' };
    }
  },

  // Process Video URL Submission
  async processUrl(inputUrl) {
    const check = this.parseYouTubeUrl(inputUrl);
    if (!check.valid) {
      if (this.errorMessage) {
        this.errorMessage.textContent = check.message || 'Please enter a valid YouTube URL.';
        this.errorMessage.classList.remove('hidden');
      }
      return;
    }

    if (this.errorMessage) this.errorMessage.classList.add('hidden');
    if (this.downloadBtn) this.downloadBtn.disabled = true;

    // Show loading spinner
    if (this.resultContainer) this.resultContainer.classList.remove('hidden');
    if (this.loadingContainer) this.loadingContainer.classList.remove('hidden');
    if (this.resultSection) this.resultSection.classList.add('hidden');

    if (this.resultContainer) {
      this.resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    try {
      const data = await API.getInfo(check.cleanUrl);
      if (!data || data.error) {
        throw new Error(data?.error || 'Could not fetch video information');
      }

      if (this.loadingContainer) this.loadingContainer.classList.add('hidden');
      if (this.resultSection) this.resultSection.classList.remove('hidden');

      // Render native video result details and format options
      UI.renderResult(data);

      // Set active format tab back to video
      this.switchFormatTab('video');

    } catch (err) {
      console.error('Error loading video details:', err);
      if (this.loadingContainer) this.loadingContainer.classList.add('hidden');
      if (this.errorMessage) {
        this.errorMessage.textContent = err.message || 'Failed to extract video formats. Please try again.';
        this.errorMessage.classList.remove('hidden');
      }
    } finally {
      if (this.downloadBtn) this.downloadBtn.disabled = false;
    }
  },

  // Trigger Direct In-App Download (Zero Ads / Zero Popups)
  async triggerDownload(url, quality, format, audioOnly, encodedTitle, directUrl) {
    const rawTitle = decodeURIComponent(encodedTitle || 'video');
    const isAudio = audioOnly === true || audioOnly === 'true';
    const modalHandler = UI.showDownloadModal(rawTitle, quality, format);

    try {
      const result = await API.getDownload(url, quality, format, isAudio, rawTitle, directUrl);
      if (result && result.downloadUrl) {
        modalHandler.finish(result.downloadUrl, result.filename);
      } else {
        throw new Error('Download stream link could not be generated.');
      }
    } catch (err) {
      console.error('Download error:', err);
      modalHandler.error(err.message || 'Download generation failed. Please try again.');
    }
  },

  // Switch Format Tabs (Video / Audio / Thumbnails)
  switchFormatTab(tabName) {
    this.activeFormatTab = tabName;
    document.querySelectorAll('.fmt-tab').forEach(t => {
      if (t.dataset.fmt === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    if (window.currentVideoData) {
      if (tabName === 'video') {
        UI.renderVideoFormats(window.currentVideoData.formats?.video || [], window.currentVideoData);
      } else if (tabName === 'audio') {
        UI.renderAudioFormats(window.currentVideoData.formats?.audio || [], window.currentVideoData);
      } else if (tabName === 'thumbnails') {
        UI.renderThumbnailFormats(window.currentVideoData.formats?.thumbnails || [], window.currentVideoData);
      }
    }
  },

  bindEvents() {
    // Start Button
    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => {
        const val = this.mediaUrl?.value.trim();
        if (!val) {
          if (this.errorMessage) {
            this.errorMessage.textContent = 'Please paste a YouTube URL first.';
            this.errorMessage.classList.remove('hidden');
          }
          this.mediaUrl?.focus();
          return;
        }
        this.processUrl(val);
      });
    }

    // Input Enter Key
    if (this.mediaUrl) {
      this.mediaUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = this.mediaUrl.value.trim();
          if (val) this.processUrl(val);
        }
      });

      this.mediaUrl.addEventListener('input', () => {
        if (this.errorMessage) this.errorMessage.classList.add('hidden');
        if (this.clearBtn) {
          if (this.mediaUrl.value.length > 0) {
            this.clearBtn.classList.remove('hidden');
          } else {
            this.clearBtn.classList.add('hidden');
          }
        }
      });
    }

    // Clear Button
    if (this.clearBtn && this.mediaUrl) {
      this.clearBtn.addEventListener('click', () => {
        this.mediaUrl.value = '';
        this.clearBtn.classList.add('hidden');
        if (this.errorMessage) this.errorMessage.classList.add('hidden');
        if (this.resultContainer) this.resultContainer.classList.add('hidden');
        if (this.resultSection) this.resultSection.classList.add('hidden');
        this.mediaUrl.focus();
      });
    }

    // Format Tab Buttons
    document.querySelectorAll('.fmt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const fmt = tab.dataset.fmt;
        if (fmt) this.switchFormatTab(fmt);
      });
    });

    // Theme Toggle
    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('light-mode');
        const currentTheme = this.getCurrentTheme();
        try {
          localStorage.setItem('theme', currentTheme);
        } catch (e) {}
      });
    }

    // FAQ Accordions
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (item) {
          const wasActive = item.classList.contains('active');
          document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
          if (!wasActive) {
            item.classList.add('active');
          }
        }
      });
    });
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
