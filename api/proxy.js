// API endpoint: /api/proxy
// Fast stream proxy & attachment download pipeline.

import http from 'http';
import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query?.url;
  const filename = req.query?.filename || 'video.mp4';

  if (!targetUrl) {
    return res.status(400).json({ error: 'Target URL is required' });
  }

  try {
    const urlObj = new URL(targetUrl);
    const client = urlObj.protocol === 'https:' ? https : http;

    const requestHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (req.headers.range) {
      requestHeaders['Range'] = req.headers.range;
    }

    const proxyReq = client.request(targetUrl, {
      method: 'GET',
      headers: requestHeaders
    }, (proxyRes) => {
      if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
        return res.redirect(proxyRes.headers.location);
      }

      res.statusCode = proxyRes.statusCode || 200;

      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Type', proxyRes.headers['content-type'] || (filename.endsWith('.mp3') ? 'audio/mpeg' : 'video/mp4'));
      
      if (proxyRes.headers['content-length']) {
        res.setHeader('Content-Length', proxyRes.headers['content-length']);
      }
      if (proxyRes.headers['accept-ranges']) {
        res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
      }
      if (proxyRes.headers['content-range']) {
        res.setHeader('Content-Range', proxyRes.headers['content-range']);
      }

      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy request error:', err);
      if (!res.headersSent) {
        res.redirect(targetUrl);
      }
    });

    proxyReq.end();
  } catch (error) {
    console.error('Proxy handler error:', error);
    res.redirect(targetUrl);
  }
}
