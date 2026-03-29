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
    dashboard: "Command Center",
    agents: "Agents",
    newAgent: "Initialize Agent",
    login: "System Access",
    password: "Password",
    enterPassword: "Enter authorization code...",
    authenticate: "Authenticate",
    logout: "Disconnect",
    identity: "Identity & Soul",
    knowledge: "Knowledge Base",
    instructions: "Core Directives",
    chat: "Owner Channel",
    connections: "External Links",
    activity: "Activity Matrix",
    active: "Online",
    inactive: "Standby",
    name: "Designation",
    backstory: "Backstory & Origin",
    personality: "Personality & Vibe",
    coreValues: "Golden Rules (Do's & Don'ts)",
    expertiseAreas: "Expertise & Knowledge",
    communicationStyle: "Communication Style",
    emotionalIntelligence: "Emotional Tone",
    language: "Language & Voice Settings",
    save: "Commit Changes",
    addEntry: "Inject Data",
    type: "Data Type",
    title: "Reference Tag",
    content: "Payload",
    url: "Source Vector",
    text: "Raw Text",
    document: "Document",
    addInstruction: "Add Directive",
    send: "Transmit",
    clearChat: "Purge Buffer",
    newConnection: "Establish Link",
    appName: "Client Designation",
    apiKey: "Access Token",
    requestCount: "Transmissions",
    lastUsed: "Last Ping",
    revoke: "Sever Link",
    userMessage: "Incoming",
    agentResponse: "Outgoing",
    timestamp: "Timestamp",
    cancel: "Abort",
    confirm: "Execute",
    deleteWarning: "Warning: Deletion is irreversible. Proceed?",
    noData: "Buffer Empty",
    loading: "Synchronizing...",
    error: "System Fault"
  },
  ar: {
    dashboard: "مركز القيادة",
    agents: "العملاء",
    newAgent: "تهيئة عميل جديد",
    login: "الوصول للنظام",
    password: "كلمة المرور",
    enterPassword: "أدخل رمز التفويض...",
    authenticate: "مصادقة",
    logout: "قطع الاتصال",
    identity: "الهوية والجوهر",
    knowledge: "قاعدة المعرفة",
    instructions: "التوجيهات الأساسية",
    chat: "قناة المالك",
    connections: "الروابط الخارجية",
    activity: "مصفوفة النشاط",
    active: "متصل",
    inactive: "استعداد",
    name: "التعيين",
    backstory: "القصة والجذور",
    personality: "الشخصية والطابع",
    coreValues: "القواعد الذهبية (المسموح والممنوع)",
    expertiseAreas: "الخبرة والمعرفة",
    communicationStyle: "أسلوب التواصل",
    emotionalIntelligence: "النبرة العاطفية",
    language: "اللغة وإعدادات الصوت",
    save: "تأكيد التغييرات",
    addEntry: "إدخال بيانات",
    type: "نوع البيانات",
    title: "وسم المرجع",
    content: "الحمولة",
    url: "متجه المصدر",
    text: "نص خام",
    document: "مستند",
    addInstruction: "إضافة توجيه",
    send: "إرسال",
    clearChat: "تفريغ الذاكرة",
    newConnection: "تأسيس رابط",
    appName: "تعيين العميل",
    apiKey: "رمز الوصول",
    requestCount: "الإرسالات",
    lastUsed: "آخر اتصال",
    revoke: "قطع الرابط",
    userMessage: "وارد",
    agentResponse: "صادر",
    timestamp: "التوقيت",
    cancel: "إلغاء",
    confirm: "تنفيذ",
    deleteWarning: "تحذير: الحذف لا يمكن التراجع عنه. هل ترغب في المتابعة؟",
    noData: "الذاكرة فارغة",
    loading: "جاري المزامنة...",
    error: "خطأ في النظام"
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
