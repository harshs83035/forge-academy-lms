import { cookies } from "next/headers";

export type Lang = "en" | "hi";
const dict = {
  en: {
    myCourses: "My Courses", certificates: "Certificates", signOut: "Sign out", welcome: "Welcome back",
    assigned: "Your assigned training modules", progress: "Progress", continue: "Continue", start: "Start", review: "Review",
    videos: "videos", completed: "Completed", inProgress: "In progress", notStarted: "Not started", locked: "Locked",
    takeQuiz: "Take assessment", quizLocked: "Finish all videos to unlock the assessment", passMark: "Pass mark",
    downloadCert: "Download certificate", noCourses: "No courses assigned yet", noCoursesHint: "Ask your administrator to assign a module.",
    backToCourses: "Back to courses", certificateEarned: "Certificate earned", bestScore: "Best score", resume: "Resume",
    nextUp: "Up next", verify: "Verify a certificate", minutes: "min",
  },
  hi: {
    myCourses: "मेरे कोर्स", certificates: "प्रमाणपत्र", signOut: "साइन आउट", welcome: "वापसी पर स्वागत है",
    assigned: "आपको सौंपे गए प्रशिक्षण मॉड्यूल", progress: "प्रगति", continue: "जारी रखें", start: "शुरू करें", review: "दोबारा देखें",
    videos: "वीडियो", completed: "पूर्ण", inProgress: "जारी", notStarted: "शुरू नहीं हुआ", locked: "लॉक",
    takeQuiz: "मूल्यांकन दें", quizLocked: "मूल्यांकन खोलने के लिए सभी वीडियो पूरे करें", passMark: "उत्तीर्ण अंक",
    downloadCert: "प्रमाणपत्र डाउनलोड करें", noCourses: "अभी कोई कोर्स नहीं सौंपा गया", noCoursesHint: "अपने प्रशासक से मॉड्यूल सौंपने को कहें।",
    backToCourses: "कोर्स पर वापस", certificateEarned: "प्रमाणपत्र प्राप्त", bestScore: "सर्वश्रेष्ठ अंक", resume: "फिर शुरू करें",
    nextUp: "अगला", verify: "प्रमाणपत्र सत्यापित करें", minutes: "मि.",
  },
} as const;
export type Key = keyof (typeof dict)["en"];

export async function getLang(): Promise<Lang> {
  return (await cookies()).get("lms_lang")?.value === "hi" ? "hi" : "en";
}
export const tr = (lang: Lang) => (k: Key): string => dict[lang][k];
