const { Readable } = require('node:stream');

function createElectronUpdateFetch(net) {
  return async function fetchUpdate(url, { signal } = {}) {
    signal?.throwIfAborted();
    return new Promise((resolve, reject) => {
      const request = net.request({
        url,
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        bypassCustomProtocolHandlers: true,
      });
      let response;
      let settled = false;

      function cleanup() {
        signal?.removeEventListener('abort', abort);
      }

      function fail(error) {
        cleanup();
        if (!settled) {
          settled = true;
          reject(error);
        }
        response?.destroy(error);
      }

      function abort() {
        const error =
          signal?.reason instanceof Error
            ? signal.reason
            : new DOMException('Update request was aborted', 'AbortError');
        fail(error);
        request.abort();
      }

      request.on('error', fail);
      request.once('abort', () => {
        fail(new DOMException('Update request was aborted', 'AbortError'));
      });
      // Electron can emit the writable request's close before receiving HTTP
      // headers. Keep cancellation active until the response actually finishes.
      request.once('redirect', (status, _method, redirectUrl) => {
        if (settled) return;
        // Electron cancels manual redirects unless followed synchronously. Expose
        // the destination first so the downloader can validate the next request.
        try {
          const headers = new Headers({ location: redirectUrl });
          settled = true;
          cleanup();
          resolve({ status, headers, body: null, redirected: false });
        } catch (error) {
          fail(error);
        } finally {
          request.abort();
        }
      });
      request.once('response', (incoming) => {
        if (settled) {
          incoming.destroy();
          return;
        }
        response = incoming;
        incoming.once('aborted', () => {
          fail(new Error('Update response was aborted'));
        });
        incoming.on('error', fail);
        incoming.once('end', cleanup);
        incoming.once('close', () => {
          cleanup();
          if (!incoming.readableEnded) request.abort();
        });
        try {
          const headers = new Headers();
          for (const [name, values] of Object.entries(incoming.headers)) {
            for (const value of Array.isArray(values) ? values : [values]) {
              if (value !== undefined) headers.append(name, value);
            }
          }
          const body = Readable.toWeb(incoming);
          settled = true;
          resolve({
            status: incoming.statusCode,
            headers,
            body,
            redirected: false,
          });
        } catch (error) {
          fail(error);
          request.abort();
        }
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) {
        abort();
        return;
      }
      try {
        request.end();
      } catch (error) {
        fail(error);
        request.abort();
      }
    });
  };
}

module.exports = { createElectronUpdateFetch };
