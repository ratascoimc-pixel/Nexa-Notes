export type ProcessingStatus = 'recorded' | 'transcribing' | 'transcribed' | 'notes-ready' | 'error';

export type StudyNotes = {
  title: string;
  mainTheme: string;
  keyPoints: string[];
  references: string[];
  illustrations: string[];
  application: string[];
  reviewQuestions: string[];
  summary: string;
};

export type OrganizationMode =
  | 'detailed-outline'
  | 'simple-outline'
  | 'summary'
  | 'key-points'
  | 'detailed-notes'
  | 'qa-review'
  | 'flashcards'
  | 'references';

export type OrganizedSection = {
  heading: string;
  body: string;
  items: string[];
  qa: { question: string; answer: string }[];
};

export type OrganizedDocument = {
  title: string;
  mode: OrganizationMode | 'study-notes';
  summary: string;
  sections: OrganizedSection[];
};

export type NotzRecording = {
  id: string;
  title: string;
  createdAt: string;
  durationMs: number;
  segmentUris: string[];
  transcript?: string;
  transcriptPdfUri?: string;
  notes?: StudyNotes;
  documents?: Partial<Record<OrganizationMode, OrganizedDocument>>;
  pdfUri?: string;
  outputPdfUris?: Partial<Record<OrganizationMode, string>>;
  status: ProcessingStatus;
  error?: string;
};
