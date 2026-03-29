import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'ar';

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: 'ltr' | 'rtl';
}

const translations = {
  en: {
    dashboard: "Dashboard",
    agents: "Agents",
    newAgent: "New Agent",
    login: "Sign In",
    password: "Password",
    enterPassword: "Enter access code...",
    authenticate: "Authenticate",
    logout: "Sign Out",
    identity: "Identity & Soul",
    knowledge: "Knowledge Base",
    instructions: "Permanent Rules",
    chat: "Owner Chat",
    connections: "Connections",
    activity: "Activity Log",
    active: "Online",
    inactive: "Offline",
    name: "Agent Name",
    agentNamePlaceholder: "What should we call this agent?",
    identityLabel: "Identity",
    identityHint: "Who are they? Describe their background, expertise, what they do, and what they know about.",
    identityPlaceholder: "E.g. Sarah is a senior sales consultant with 10 years experience in SaaS. She specializes in enterprise deals and knows our product catalog inside out...",
    soulLabel: "Soul",
    soulHint: "Personality & vibe. How do they speak, their tone, values, and what makes them unique.",
    soulPlaceholder: "E.g. Warm and confident, never pushy. Uses simple language, asks good questions, and always listens before responding. Slightly witty but always professional...",
    backstory: "Backstory & Origin",
    personality: "Personality & Vibe",
    coreValues: "Golden Rules (Do's & Don'ts)",
    expertiseAreas: "Expertise & Knowledge",
    communicationStyle: "Communication Style",
    emotionalIntelligence: "Emotional Tone",
    language: "Language",
    languageVoice: "Language & Voice",
    model: "AI Model",
    save: "Save Changes",
    addEntry: "Add Entry",
    type: "Type",
    title: "Title",
    content: "Content",
    url: "URL",
    text: "Text",
    document: "Document",
    addInstruction: "Add Rule",
    send: "Send",
    clearChat: "Clear Chat",
    newConnection: "New Connection",
    appName: "App Name",
    apiKey: "API Key",
    requestCount: "Requests",
    lastUsed: "Last Used",
    revoke: "Revoke",
    userMessage: "You",
    agentResponse: "Agent",
    timestamp: "Time",
    cancel: "Cancel",
    confirm: "Confirm",
    deleteWarning: "This cannot be undone. Are you sure?",
    noData: "Nothing here yet",
    loading: "Loading...",
    error: "Something went wrong",
    permanentRulesDesc: "Instructions this agent always follows — what to do, what to never do",
    allAgents: "All Agents",
  },
  ar: {
    dashboard: "لوحة التحكم",
    agents: "العملاء",
    newAgent: "عميل جديد",
    login: "تسجيل الدخول",
    password: "كلمة المرور",
    enterPassword: "أدخل رمز الوصول...",
    authenticate: "مصادقة",
    logout: "تسجيل الخروج",
    identity: "الهوية والجوهر",
    knowledge: "قاعدة المعرفة",
    instructions: "القواعد الدائمة",
    chat: "محادثة المالك",
    connections: "الاتصالات",
    activity: "سجل النشاط",
    active: "متصل",
    inactive: "غير متصل",
    name: "اسم العميل",
    agentNamePlaceholder: "ما الاسم الذي نطلق على هذا العميل؟",
    identityLabel: "الهوية",
    identityHint: "من هم؟ صف خلفيتهم وخبراتهم وما يفعلونه.",
    identityPlaceholder: "مثال: سارة مستشارة مبيعات أولى بخبرة 10 سنوات في مجال SaaS...",
    soulLabel: "الجوهر",
    soulHint: "الشخصية والطابع. كيف يتحدثون ونبرتهم وقيمهم.",
    soulPlaceholder: "مثال: دافئة وواثقة، تستخدم لغة بسيطة وتطرح أسئلة جيدة...",
    backstory: "القصة والجذور",
    personality: "الشخصية والطابع",
    coreValues: "القواعد الذهبية (المسموح والممنوع)",
    expertiseAreas: "الخبرة والمعرفة",
    communicationStyle: "أسلوب التواصل",
    emotionalIntelligence: "النبرة العاطفية",
    language: "اللغة",
    languageVoice: "اللغة والصوت",
    model: "نموذج الذكاء الاصطناعي",
    save: "حفظ التغييرات",
    addEntry: "إضافة إدخال",
    type: "النوع",
    title: "العنوان",
    content: "المحتوى",
    url: "الرابط",
    text: "نص",
    document: "مستند",
    addInstruction: "إضافة قاعدة",
    send: "إرسال",
    clearChat: "مسح المحادثة",
    newConnection: "اتصال جديد",
    appName: "اسم التطبيق",
    apiKey: "مفتاح API",
    requestCount: "الطلبات",
    lastUsed: "آخر استخدام",
    revoke: "إلغاء",
    userMessage: "أنت",
    agentResponse: "العميل",
    timestamp: "الوقت",
    cancel: "إلغاء",
    confirm: "تأكيد",
    deleteWarning: "لا يمكن التراجع عن هذا. هل أنت متأكد؟",
    noData: "لا يوجد شيء هنا بعد",
    loading: "جاري التحميل...",
    error: "حدث خطأ ما",
    permanentRulesDesc: "التعليمات التي يتبعها هذا العميل دائمًا",
    allAgents: "جميع العملاء",
  }
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('en');

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string) => {
    return translations[language][key as keyof typeof translations['en']] || key;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, dir: language === 'ar' ? 'rtl' : 'ltr' }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
