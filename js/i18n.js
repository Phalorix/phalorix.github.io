// Strings used by scripts (3D labels, woven words, form messages, project gallery).
export const LANG = (document.documentElement.lang || 'en').startsWith('ar') ? 'ar' : 'en';
export const RTL = LANG === 'ar';

const STRINGS = {
  en: {
    // what the shuttle weaves into the aurora: "everything you build"
    words: ['WEBSITES', 'MOBILE APPS', 'AI AGENTS', 'CHATBOTS', 'ONLINE STORES', 'DASHBOARDS', 'BRANDS'],
    weaveFont: '600 {px}px "Instrument Sans", "Helvetica Neue", Arial, sans-serif',
    loading: 'Loading',
    services: ['AI & ML', 'Web', 'Mobile apps', 'Design', 'Marketing', 'Data', 'Cloud & care'],
    disciplines: ['Chatbots', 'Voice assistants', 'AI copilots', 'Company knowledge (RAG)', 'AI agents', 'Image recognition', 'Document AI',
      'Arabic & English NLP', 'Forecasting', 'Recommendations', 'Generative media', 'Custom models', 'Safe & reliable AI', 'AI strategy'],
    snap: { raw: 'Your data, as it arrives', reed: 'Snapplyze reads it', insight: 'What changed · why · what next' },
    loom: ['Back beam', 'Pattern frames', 'Shuttle & reed', 'Cloth beam'],
    reading: 'Card on top reads',
    sound: {
      on: 'Sound is on. Run your cursor across the light', touch: 'Sound is on. Tap the light to play it',
      armed: 'Click anywhere for sound, then run your cursor across the light', armedTouch: 'Tap anywhere for sound, then tap the light',
      off: 'Turn on sound, then run your cursor across the light', offTouch: 'Turn on sound, then tap the light to play it',
    },
    form: {
      missing: 'Almost there. We still need: ',
      name: 'your name', email: 'a valid email', message: 'a short message (10+ characters)',
      sending: 'Sending…', sent: 'Thank you! We received your message and will reply within one business day.',
      mailto: 'Your email app should open with your message ready to send.',
    },
  },
  ar: {
    words: ['مواقع', 'تطبيقات', 'وكلاء أذكياء', 'شات بوت', 'متاجر', 'لوحات بيانات', 'هويات بصرية'],
    weaveFont: '700 {px}px "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif',
    loading: 'جارٍ التحميل',
    services: ['الذكاء الاصطناعي', 'المواقع', 'تطبيقات الموبايل', 'التصميم', 'التسويق', 'البيانات', 'السحابة والصيانة'],
    disciplines: ['شات بوت', 'المساعد الصوتي', 'مساعدون أذكياء', 'معلومات الشركة (RAG)', 'وكلاء ذكاء اصطناعي', 'التعرّف على الصور', 'قراءة المستندات',
      'العربية والإنجليزية', 'توقّع المبيعات', 'التوصيات', 'محتوى بالذكاء الاصطناعي', 'نماذج مخصّصة', 'أمان وموثوقية', 'الاستراتيجية'],
    snap: { raw: 'بياناتك كما تصل', reed: 'يقرؤها Snapplyze', insight: 'ما الذي تغيّر · لماذا · ماذا بعد' },
    loom: ['الأسطوانة الخلفية', 'إطارات النقشة', 'المكّوك والمشط', 'أسطوانة القماش'],
    reading: 'البطاقة في الأعلى تقول',
    sound: {
      on: 'الصوت يعمل. حرّك المؤشر فوق الضوء', touch: 'الصوت يعمل. المس الضوء لتعزف عليه',
      armed: 'اضغط في أي مكان لتشغيل الصوت، ثم حرّك المؤشر فوق الضوء', armedTouch: 'المس الشاشة لتشغيل الصوت، ثم المس الضوء',
      off: 'شغّل الصوت، ثم حرّك المؤشر فوق الضوء', offTouch: 'شغّل الصوت، ثم المس الضوء لتعزف عليه',
    },
    form: {
      missing: 'خطوة أخيرة! ينقصنا: ',
      name: 'اسمك', email: 'بريد إلكتروني صحيح', message: 'رسالة قصيرة (10 أحرف على الأقل)',
      sending: 'جارٍ الإرسال…', sent: 'شكرًا لك! وصلتنا رسالتك، وسنردّ عليك خلال يوم عمل واحد.',
      mailto: 'سيفتح تطبيق البريد لديك والرسالة جاهزة للإرسال.',
    },
  },
};

export const T = STRINGS[LANG];

/** Prefix a site path with the language folder. */
export const path = (p) => (LANG === 'ar' ? `/ar${p}` : p);

export const PROJECTS = [
  {
    title: 'Quellor', url: 'https://quellor.net',
    images: ['quellor/home.webp', 'quellor/search.webp', 'quellor/blog.webp', 'quellor/login.webp'],
    en: { tag: 'Social platform · Web design & development', desc: 'A blogging social platform built for creators. Quellor gives people a home for longer thoughts, stories and news, as an alternative to endless short videos.' },
    ar: { tag: 'منصة اجتماعية · تصميم وتطوير ويب', desc: 'منصة تدوين اجتماعية لصنّاع المحتوى. تمنح Quellor الناس مساحة للكتابة الطويلة والقصص والأخبار، كبديل للفيديوهات القصيرة التي لا تنتهي.' },
  },
  {
    title: 'Uplo', url: 'https://uplo-store.com',
    images: ['uplo/about.webp', 'uplo/item.webp', 'uplo/cart.webp', 'uplo/info-1.webp'],
    en: { tag: 'Online store · Web design & development', desc: 'A clean, minimal online store built around looks and ease of use, so the brand stays the star and shopping feels effortless.' },
    ar: { tag: 'متجر إلكتروني · تصميم وتطوير ويب', desc: 'متجر إلكتروني بسيط وأنيق، يجمع بين الشكل الجميل وسهولة الاستخدام، فتبقى العلامة التجارية في الواجهة ويصبح الشراء سهلًا وممتعًا.' },
  },
  {
    title: 'Learnify.ai', url: 'https://learnify-ai-one.vercel.app',
    images: ['learnify/login.webp', 'learnify/chat.webp', 'learnify/tasks.webp'],
    en: { tag: 'AI · Education · Web design & development', desc: 'A modern learning platform for universities, with AI tools that help both students and professors.' },
    ar: { tag: 'ذكاء اصطناعي · تعليم · تصميم وتطوير ويب', desc: 'منصة تعليمية حديثة للجامعات، بأدوات ذكاء اصطناعي تساعد الطلاب والأساتذة.' },
  },
  {
    title: 'Latin', url: 'https://latin-ten.vercel.app/',
    images: ['latin/home.webp', 'latin/checkout.webp', 'latin/Login.webp'],
    en: { tag: 'Beauty & fashion · Online store', desc: 'Latin is a beauty and fashion brand known for its lip gloss. To match a fantastic, stylish brand, we designed and built an elegant online store.' },
    ar: { tag: 'تجميل وأزياء · متجر إلكتروني', desc: 'Latin علامة تجميل وأزياء تشتهر بمنتجات ملمّع الشفاه. صمّمنا وطوّرنا لها متجرًا إلكترونيًا راقيًا يليق بعلامة عصرية وأنيقة.' },
  },
  {
    title: 'DHEBH', url: 'https://dhebh.vercel.app/',
    images: ['dhebh/home.webp', 'dhebh/hospital.webp', 'dhebh/mission.webp', 'dhebh/reviews.webp', 'dhebh/contact.webp'],
    en: { tag: 'Healthcare · Web design & development', desc: 'The website of a leading hospital in Saudi Arabia: modern, professional and as trustworthy as the hospital itself.' },
    ar: { tag: 'رعاية صحية · تصميم وتطوير ويب', desc: 'موقع مستشفى رائد في السعودية: حديث واحترافي، ويعكس نفس الثقة التي يحملها اسم المستشفى.' },
  },
];
