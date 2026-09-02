/*
  إصدار جديد كليًا من الكاش يجبر كل الأجهزة (Chrome وPWA) على التخلص من أي رد قديم مخزّن،
  بما فيه أي رد خطأ محفوظ بالغلط من نسخة سابقة من هذا الملف.
*/
const CACHE_NAME = "installment-ledger-v6";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // لا نتدخل إطلاقًا في أي شيء غير GET (تسجيل الدخول، الحفظ، الرفع... كلها POST/PATCH/DELETE).
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // القاعدة الأهم: لا نلمس أي طلب خارج نطاق موقعنا (نفس origin GitHub Pages فقط).
  // هذا يستثني تلقائيًا: مكتبة Supabase من jsDelivr، وكل نداءات Supabase
  // (Auth, REST, Storage) — لا تُخزَّن هذه أبدًا في كاش الـ Service Worker،
  // ويتولى المتصفح نفسه التعامل معها مباشرة عبر الشبكة.
  if (url.origin !== self.location.origin) return;

  // لصفحة index.html وأي طلب تصفّح (navigation): شبكة أولًا، وإن تعذر الاتصال نرجع للكاش.
  // هذا يضمن أن أي نشر جديد يظهر فورًا عند توفر الإنترنت، مع بقاء العمل offline.
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname === "/") {
    event.respondWith(networkFirst(req));
    return;
  }

  // لباقي ملفات نفس الموقع (manifest, icons...): كاش أولًا مع تحديث الخلفية.
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirst(req) {
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      if (res && res.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
      }
      return res;
    })
    .catch(() => null);
  return cached || (await networkPromise) || fetch(req);
}
