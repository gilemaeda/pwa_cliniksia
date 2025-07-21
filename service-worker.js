// Service Worker para Cliniks IA - PWA Otimizado
const CACHE_NAME = 'cliniks-ai-cache-v3';
const STATE_CACHE = 'cliniks-state-v3';
const RUNTIME_CACHE = 'cliniks-runtime-v3';
const STATE_PRESERVATION_TIME = 5 * 60 * 1000; // 5 minutos

// URLs essenciais para cache inicial
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/favicon.svg',
  '/Logo_cliniks_ia.png',
  '/icon-192x192.png',
  '/icon-512x512.png'
];

// Recursos que devem ser cacheados em runtime
const runtimeCachePatterns = [
  /^https:\/\/fonts\.googleapis\.com/,
  /^https:\/\/fonts\.gstatic\.com/,
  /^https:\/\/cdn\.gpteng\.co/,
  /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
  /\.(?:css|js)$/
];

// Função para verificar se uma URL é válida para cache
function isValidUrl(url) {
  // Verificar se a URL é http ou https (evitar chrome-extension:// e outros)
  return url && (url.startsWith('http:') || url.startsWith('https:'));
}

// Instalação do service worker e cache de recursos
self.addEventListener('install', (event) => {
  // Força a ativação imediata do service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.error('Erro ao criar cache inicial:', error);
      })
  );
});

// Estratégia de cache otimizada para PWA
self.addEventListener('fetch', (event) => {
  // Ignorar requisições não HTTP/HTTPS
  if (!isValidUrl(event.request.url)) {
    return;
  }

  // Ignorar requisições não GET
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Estratégia Cache First para recursos estáticos
  if (runtimeCachePatterns.some(pattern => pattern.test(event.request.url))) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(event.request).then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Fallback para recursos de imagem
            if (event.request.destination === 'image') {
              return caches.match('/Logo_cliniks_ia.png');
            }
          });
        });
      })
    );
    return;
  }

  // Estratégia Network First para páginas HTML
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then(cachedResponse => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Estratégia Stale While Revalidate para outros recursos
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && isValidUrl(event.request.url)) {
              try {
                cache.put(event.request, networkResponse.clone());
              } catch (error) {
                console.warn('Erro ao armazenar em cache:', error);
              }
            }
            return networkResponse;
          })
          .catch(error => {
            console.warn('Erro de rede, usando cache:', error);
            return cachedResponse;
          });

        return cachedResponse || fetchPromise;
      });
    })
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  console.log('Service Worker ativado - Cliniks IA PWA v3');

  // Toma controle de clientes não controlados (páginas abertas)
  event.waitUntil(clients.claim());

  // Limpa caches antigos
  const cacheWhitelist = [CACHE_NAME, STATE_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  // Notificar clientes sobre atualização
  event.waitUntil(
    clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_UPDATED',
          version: 'v3'
        });
      });
    })
  );
});

// Receber mensagens do cliente para preservação de estado
self.addEventListener('message', async (event) => {
  const message = event.data;
  
  if (!message || !message.type) return;
  
  switch (message.type) {
    case 'PRESERVE_STATE':
      // Preservar estado da aplicação
      try {
        // Adiciona uma verificação para garantir que a mensagem de estado é válida
        if (!message.state || !message.state.url) {
          console.warn('[Service Worker] Mensagem PRESERVE_STATE inválida recebida. Ignorando.');
          return;
        }

        const stateCache = await caches.open(STATE_CACHE);
        const url = new URL(message.state.url);
        
        // Cria uma URL válida para ser usada como chave do cache
        const cacheKey = new URL(`/__state__${url.pathname}`, self.location.origin);

        // Armazenar estado no cache usando a chave válida
        await stateCache.put(
          cacheKey,
          new Response(JSON.stringify({
            ...message.state,
            preservedBy: message.tabId,
            timestamp: Date.now()
          }))
        );
        
        console.log('[Service Worker] Estado preservado para:', url.pathname);
        
        // Confirmar para o cliente
        if (event.source) {
          event.source.postMessage({
            type: 'STATE_PRESERVED',
            tabId: message.tabId,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('[Service Worker] Erro ao preservar estado:', error);
      }
      break;
      
    case 'TAB_FOCUSED':
      // Aba ganhou foco, nada a fazer por enquanto
      break;
      
    case 'TAB_BLURRED':
      // Aba perdeu foco, nada a fazer por enquanto
      break;
  }
});